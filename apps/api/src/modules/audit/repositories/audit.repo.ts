import { Types, type ClientSession } from 'mongoose';
import { AuditLogModel } from '../models/audit-log.model.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string;
  platformRole?: string;
  scope?: { type: 'studio' | 'personal' | 'platform'; id: string };
  target?: { type: string; id: string };
  ipHash?: string;
  requestId?: string;
  meta?: Record<string, string | number | boolean>;
}

/**
 * Insert-only by design: this repository has no update or delete. In production the
 * application's MongoDB user is also granted insert-only on the collection (SECURITY §6).
 */
export const auditRepo = {
  async insert(entry: AuditEntry, session?: ClientSession): Promise<void> {
    await AuditLogModel.create(
      [
        {
          at: new Date(),
          action: entry.action,
          actor: {
            ...(entry.actorUserId ? { userId: new Types.ObjectId(entry.actorUserId) } : {}),
            ...(entry.platformRole ? { platformRole: entry.platformRole } : {}),
          },
          ...(entry.scope
            ? { scope: { type: entry.scope.type, id: new Types.ObjectId(entry.scope.id) } }
            : {}),
          ...(entry.target ? { target: entry.target } : {}),
          ...(entry.ipHash ? { ipHash: entry.ipHash } : {}),
          ...(entry.requestId ? { requestId: entry.requestId } : {}),
          ...(entry.meta ? { meta: entry.meta } : {}),
        },
      ],
      session ? { session } : {},
    );
  },

  /** Studio activity (ST-41): newest first, keyset-paged on (at, _id). */
  async listForScope(scopeId: string, after: { at: Date; id: string } | undefined, limit: number) {
    const filter: Record<string, unknown> = { 'scope.id': new Types.ObjectId(scopeId) };
    if (after) {
      filter.$or = [
        { at: { $lt: after.at } },
        { at: after.at, _id: { $lt: new Types.ObjectId(after.id) } },
      ];
    }
    return AuditLogModel.find(filter).sort({ at: -1, _id: -1 }).limit(limit).lean();
  },

  /** Read access for tests and support tooling. */
  async listForActor(userId: string, limit = 50) {
    return AuditLogModel.find({ 'actor.userId': new Types.ObjectId(userId) })
      .sort({ at: -1 })
      .limit(limit)
      .lean();
  },
};
