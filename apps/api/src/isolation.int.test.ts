/**
 * Tenant isolation suite (TESTING §4) — GENERATED from the route registry.
 * For every studio route it runs:
 *   1. owner of S1 on S1's resources            → passes the guard (not 401/403/404, not 5xx)
 *   2. owner of S2 with S1's ids in the path     → 404 (existence never revealed)
 *   3. owner of S2, own studioId + S1's sub-ids  → 404 (no cross-tenant sub-resources)
 *   4. viewer of S1 on a permission it lacks     → 403
 *   5. signed out                                → 401
 * A new studio route is covered automatically; one whose path params have no fixture
 * fails the suite, so routes can't be added without isolation coverage.
 */
import { randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RouteMeta } from './kernel/routes.js';
import { SYSTEM_ROLES } from './modules/tenancy/index.js';
import { createTestApp, TEST_PASSWORD, type TestApp } from './testing.js';

let t: TestApp;
let owner: Awaited<ReturnType<TestApp['user']>>;
let outsider: Awaited<ReturnType<TestApp['user']>>;
let viewer: Awaited<ReturnType<TestApp['user']>>;
let outsiderStudio: Record<string, string>;

const FIXTURE_PARAMS = new Set(['studioId', 'userId', 'invitationId']);

/** A fresh studio per route, so destructive routes can't affect other cases. */
async function studioFixture(by: typeof owner, extra = true): Promise<Record<string, string>> {
  const slug = `iso-${randomBytes(4).toString('hex')}`;
  const created = await by.b.post('/studios', { name: 'Iso Studio', slug });
  expect(created.status).toBe(201);
  const studioId = created.body.id as string;
  const fx: Record<string, string> = {
    studioId,
    password: TEST_PASSWORD,
    freshEmail: `new_${randomBytes(4).toString('hex')}@example.com`,
  };
  if (!extra) return fx;

  const roles = mongoose.connection.collection('roles');
  const memberships = mongoose.connection.collection('memberships');
  const addMember = async (userId: string, roleKey: 'viewer' | 'editor') => {
    const role = await roles.findOne({ tenantId: null, key: roleKey });
    await memberships.insertOne({
      tenantId: new Types.ObjectId(studioId),
      userId: new Types.ObjectId(userId),
      roleId: role!._id,
      roleKey,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };
  // The target member (an editor) for routes with {userId}.
  const target = await t.user();
  await addMember(target.id, 'editor');
  await addMember(viewer.id, 'viewer');
  fx.userId = target.id;

  const invite = await by.b.post(`/studios/${studioId}/invitations`, {
    email: `inv_${randomBytes(4).toString('hex')}@example.com`,
    roleKey: 'viewer',
  });
  expect(invite.status).toBe(201);
  fx.invitationId = invite.body.id as string;
  return fx;
}

const fill = (path: string, fx: Record<string, string>) =>
  path.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!fx[name]) throw new Error(`no fixture for {${name}}`);
    return fx[name]!;
  });

const paramsOf = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

beforeAll(async () => {
  t = await createTestApp('isolation');
  [owner, outsider, viewer] = await Promise.all([t.user(), t.user(), t.user()]);
  outsiderStudio = await studioFixture(outsider, false);
});
afterAll(() => t.close());

describe('tenant isolation (generated from the route registry)', () => {
  it('covers every studio route, and every path param has a fixture', () => {
    const studioRoutes = t.registry.routes.filter((r) => r.scope === 'studio');
    expect(studioRoutes.length).toBeGreaterThanOrEqual(12);
    for (const r of studioRoutes) {
      expect(r.permission, `${r.method} ${r.path}`).toBeTruthy();
      for (const p of paramsOf(r.path)) {
        expect(FIXTURE_PARAMS.has(p), `${r.method} ${r.path}: no fixture for {${p}}`).toBe(true);
      }
    }
  });

  // Built lazily: the registry exists only after beforeAll.
  it('enforces all five cases on every studio route', async () => {
    const routes: RouteMeta[] = t.registry.routes.filter((r) => r.scope === 'studio');
    const viewerPerms = new Set<string>(SYSTEM_ROLES.viewer.permissions);
    const failures: string[] = [];
    const check = (label: string, ok: boolean, status: number) => {
      if (!ok) failures.push(`${label} → got ${status}`);
    };

    for (const route of routes) {
      const name = `${route.method.toUpperCase()} ${route.path}`;
      const fx = await studioFixture(owner);
      const body = route.isolation?.body?.(fx);
      const path = fill(route.path, fx);

      // 5. signed out
      const anon = await request(t.app)
        [route.method](`/api/v1${path}`)
        .set('Origin', 'http://localhost:5173');
      check(
        `${name} [signed out] expected 401/403(csrf)`,
        [401, 403].includes(anon.status),
        anon.status,
      );

      // 2. outsider with S1's ids
      const foreign = await outsider.b.call(route.method, path, body);
      check(`${name} [other tenant, S1 ids] expected 404`, foreign.status === 404, foreign.status);

      // 3. outsider selecting their own studio but pointing at S1's sub-resources
      if (paramsOf(route.path).length > 1) {
        const mixed = fill(route.path, { ...fx, studioId: outsiderStudio.studioId! });
        const res = await outsider.b.call(route.method, mixed, body);
        check(`${name} [own studio, S1 sub-ids] expected 404`, res.status === 404, res.status);
      }

      // 4. lower role
      if (route.permission !== 'member' && !viewerPerms.has(route.permission!)) {
        const low = await viewer.b.call(route.method, path, body);
        check(`${name} [viewer] expected 403`, low.status === 403, low.status);
      }

      // 1. legitimate owner (last: it may mutate the fixture)
      const own = await owner.b.call(route.method, path, body);
      check(
        `${name} [owner] expected to pass the guard`,
        ![401, 403, 404].includes(own.status) && own.status < 500,
        own.status,
      );
    }
    expect(failures).toEqual([]);
  });
});
