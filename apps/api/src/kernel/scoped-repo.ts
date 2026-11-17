import type { Scope } from '@snapshare/types';
import {
  Types,
  type ClientSession,
  type Model,
  type QueryFilter,
  type UpdateQuery,
} from 'mongoose';

/**
 * Tenant-scoped data access (ARCHITECTURE §5.2, ADR-007). `forScope(scope)` returns
 * an accessor that AND-s the tenant filter into every read, update and delete, and
 * stamps it onto every insert. Callers cannot widen it: the caller's filter is
 * combined with `$and`, so even a filter naming another tenant matches nothing.
 *
 * `tenantPath` is the field holding the studio id (e.g. `tenantId`, `target.tenantId`).
 */
export class ScopedRepository<T> {
  constructor(
    private readonly model: Model<T>,
    private readonly tenantPath: string,
  ) {}

  forScope(scope: Scope) {
    if (scope.type !== 'studio' || !Types.ObjectId.isValid(scope.id)) {
      throw new Error(`ScopedRepository(${this.model.modelName}) needs a studio scope`);
    }
    const tenantId = new Types.ObjectId(scope.id);
    const { model, tenantPath } = this;
    const scoped = (filter: QueryFilter<T> = {}) =>
      ({ $and: [filter, { [tenantPath]: tenantId }] }) as QueryFilter<T>;
    const opts = (session?: ClientSession) => (session ? { session } : {});

    return {
      tenantId,
      find: (filter?: QueryFilter<T>) => model.find(scoped(filter)),
      findOne: (filter?: QueryFilter<T>) => model.findOne(scoped(filter)),
      /** Ids from the client are untrusted: an invalid or foreign id simply matches nothing. */
      findById: (id: string) =>
        Types.ObjectId.isValid(id)
          ? model.findOne(scoped({ _id: new Types.ObjectId(id) } as QueryFilter<T>))
          : model.findOne({ _id: null, [tenantPath]: tenantId } as QueryFilter<T>),
      countDocuments: (filter?: QueryFilter<T>, session?: ClientSession) =>
        model.countDocuments(scoped(filter), opts(session)),
      updateOne: (filter: QueryFilter<T>, update: UpdateQuery<T>, session?: ClientSession) =>
        model.updateOne(scoped(filter), update, opts(session)),
      updateMany: (filter: QueryFilter<T>, update: UpdateQuery<T>, session?: ClientSession) =>
        model.updateMany(scoped(filter), update, opts(session)),
      deleteOne: (filter: QueryFilter<T>, session?: ClientSession) =>
        model.deleteOne(scoped(filter), opts(session)),
      /** Inserts with the tenant stamped on; returns the stored document as a plain object. */
      async create(doc: Partial<T>, session?: ClientSession): Promise<T> {
        const withTenant = setPath({ ...doc } as Record<string, unknown>, tenantPath, tenantId);
        // Mongoose's generic create() overloads can't be satisfied for an unknown T.
        const untyped = model as unknown as Model<Record<string, unknown>>;
        const [created] = await untyped.create([withTenant], opts(session));
        return created!.toObject() as T;
      },
    };
  }
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  // tenantPath is a code constant, but never let a path reach Object.prototype.
  if (keys.some((k) => UNSAFE_KEYS.has(k))) throw new Error(`unsafe tenant path "${path}"`);
  let cursor = obj;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = { ...((cursor[key] as Record<string, unknown> | undefined) ?? {}) };
    // Keys are a code constant, already checked against UNSAFE_KEYS above.
    // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
    cursor = cursor[key] as Record<string, unknown>;
  }
  // Overwrites any caller-supplied tenant: the scope always wins.
  cursor[keys.at(-1)!] = value;
  return obj;
}
