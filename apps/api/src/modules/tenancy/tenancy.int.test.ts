/**
 * Studios, invitations and role rules (API_SPEC §2.2, SECURITY §3.2): privilege
 * escalation, last-owner protection, immediate access removal, seat limits.
 */
import { randomBytes } from 'node:crypto';
import { DEFAULT_PLAN } from '@snapshare/config';
import { OutboxModel } from '@snapshare/server-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_PASSWORD, type TestApp } from '../../testing.js';
import { ScopedRepository } from '../../kernel/scoped-repo.js';
import { MembershipModel, type MembershipDoc } from './models/membership.model.js';

let t: TestApp;
type User = Awaited<ReturnType<TestApp['user']>>;

beforeAll(async () => {
  t = await createTestApp('tenancy');
});
afterAll(() => t.close());

const slug = () => `studio-${randomBytes(4).toString('hex')}`;

async function newStudio(owner: User) {
  const res = await owner.b.post('/studios', { name: 'Lens Story', slug: slug() });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function inviteToken(email: string) {
  const entry = await OutboxModel.findOne({
    'payload.template': 'studio_invite',
    'payload.to': email,
  })
    .sort({ _id: -1 })
    .lean();
  const url = (entry?.payload as { data: { url: string } }).data.url;
  return url.split('/invite/')[1]!;
}

/** Invites `member` with a role and has them accept; returns nothing. */
async function join(owner: User, studioId: string, member: User, roleKey: string) {
  const inv = await owner.b.post(`/studios/${studioId}/invitations`, {
    email: member.email,
    roleKey,
  });
  expect(inv.status).toBe(201);
  const accepted = await member.b.post(`/invitations/${await inviteToken(member.email)}/accept`);
  expect(accepted.status).toBe(200);
}

describe('creating a studio', () => {
  it('needs a verified email', async () => {
    const u = await t.user({ verified: false });
    const res = await u.b.post('/studios', { name: 'Lens Story', slug: slug() });
    expect(res.status).toBe(403);
    expect(res.body.meta.reason).toBe('email_unverified');
  });

  it('makes the creator owner and lists it in /me workspaces', async () => {
    const u = await t.user();
    const s = slug();
    const res = await u.b.post('/studios', { name: 'Lens Story', slug: s });
    expect(res.body).toMatchObject({ type: 'studio', slug: s, roleKey: 'owner' });
    const me = await u.b.get('/me');
    expect(me.body.workspaces).toEqual([
      { type: 'studio', id: res.body.id, name: 'Lens Story', slug: s, roleKey: 'owner' },
    ]);
  });

  it('checks slug availability and rejects taken or reserved addresses', async () => {
    const u = await t.user();
    const s = slug();
    expect((await u.b.get(`/studios/slug-availability?slug=${s}`)).body.available).toBe(true);
    await u.b.post('/studios', { name: 'First', slug: s });
    expect((await u.b.get(`/studios/slug-availability?slug=${s}`)).body.available).toBe(false);
    const dup = await u.b.post('/studios', { name: 'Second', slug: s });
    expect(dup.status).toBe(409);
    const reserved = await u.b.get('/studios/slug-availability?slug=admin');
    expect(reserved.body).toMatchObject({ available: false, reason: 'This address is reserved' });
    expect((await u.b.post('/studios', { name: 'X', slug: 'api' })).status).toBe(400);
  });
});

describe('invitations', () => {
  it('shows a safe preview, then joins the invited user with the invited role', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const invitee = await t.user();
    await owner.b.post(`/studios/${studioId}/invitations`, {
      email: invitee.email,
      roleKey: 'editor',
    });
    const token = await inviteToken(invitee.email);

    const preview = await (await t.browser()).get(`/invitations/${token}`);
    expect(preview.body).toMatchObject({
      studioName: 'Lens Story',
      roleKey: 'editor',
      status: 'pending',
    });
    expect(preview.body.emailHint).toMatch(/^u\*\*\*@example\.com$/);
    expect(JSON.stringify(preview.body)).not.toContain(studioId);

    const accepted = await invitee.b.post(`/invitations/${token}/accept`);
    expect(accepted.body).toMatchObject({ id: studioId, roleKey: 'editor' });
    const members = await owner.b.get(`/studios/${studioId}/members`);
    expect(members.body.data.map((m: { roleKey: string }) => m.roleKey).sort()).toEqual([
      'editor',
      'owner',
    ]);
  });

  it('refuses a different signed-in account (wrong-account warning)', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const invitee = await t.user();
    const stranger = await t.user();
    await owner.b.post(`/studios/${studioId}/invitations`, {
      email: invitee.email,
      roleKey: 'viewer',
    });
    const res = await stranger.b.post(`/invitations/${await inviteToken(invitee.email)}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.meta).toMatchObject({ reason: 'email_mismatch' });
    expect((await stranger.b.get(`/studios/${studioId}`)).status).toBe(404);
  });

  it('a revoked invitation no longer works', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const invitee = await t.user();
    const inv = await owner.b.post(`/studios/${studioId}/invitations`, {
      email: invitee.email,
      roleKey: 'viewer',
    });
    await owner.b.del(`/studios/${studioId}/invitations/${inv.body.id}`);
    const res = await invitee.b.post(`/invitations/${await inviteToken(invitee.email)}/accept`);
    expect(res.status).toBe(409);
  });

  it(`enforces the default plan's seat limit (${DEFAULT_PLAN.limits.seats})`, async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    for (let i = 1; i < DEFAULT_PLAN.limits.seats; i++) {
      const r = await owner.b.post(`/studios/${studioId}/invitations`, {
        email: `seat${i}_${randomBytes(3).toString('hex')}@example.com`,
        roleKey: 'viewer',
      });
      expect(r.status).toBe(201);
    }
    const over = await owner.b.post(`/studios/${studioId}/invitations`, {
      email: `over_${randomBytes(3).toString('hex')}@example.com`,
      roleKey: 'viewer',
    });
    expect(over.status).toBe(422);
    expect(over.body).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      meta: { metric: 'seats', limit: DEFAULT_PLAN.limits.seats },
    });
  });
});

describe('role rules (no privilege escalation)', () => {
  it("an admin can't invite or promote anyone to owner, or touch an owner", async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const admin = await t.user();
    const editor = await t.user();
    await join(owner, studioId, admin, 'admin');
    await join(owner, studioId, editor, 'editor');

    expect(
      (await admin.b.patch(`/studios/${studioId}/members/${editor.id}`, { roleKey: 'owner' }))
        .status,
    ).toBe(403);
    expect(
      (await admin.b.patch(`/studios/${studioId}/members/${owner.id}`, { roleKey: 'viewer' }))
        .status,
    ).toBe(403);
    expect((await admin.b.del(`/studios/${studioId}/members/${owner.id}`)).status).toBe(403);
    expect(
      (
        await admin.b.post(`/studios/${studioId}/invitations`, {
          email: 'x@example.com',
          roleKey: 'owner',
        })
      ).status,
    ).toBe(400);
    // Within their rank, admins can manage the team.
    expect(
      (await admin.b.patch(`/studios/${studioId}/members/${editor.id}`, { roleKey: 'viewer' }))
        .status,
    ).toBe(204);
  });

  it("an editor can't manage the team at all", async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const editor = await t.user();
    await join(owner, studioId, editor, 'editor');
    const res = await editor.b.post(`/studios/${studioId}/invitations`, {
      email: 'y@example.com',
      roleKey: 'viewer',
    });
    expect(res.status).toBe(403);
    expect(res.body.meta.permission).toBe('team.manage');
  });

  it('protects the last owner', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const demote = await owner.b.patch(`/studios/${studioId}/members/${owner.id}`, {
      roleKey: 'admin',
    });
    expect(demote.status).toBe(409);
    expect(demote.body.meta.reason).toBe('last_owner');
    expect((await owner.b.del(`/studios/${studioId}/members/${owner.id}`)).status).toBe(409);
  });
});

describe('access changes take effect immediately', () => {
  it('a removed member loses access on their very next request', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const member = await t.user();
    await join(owner, studioId, member, 'editor');
    expect((await member.b.get(`/studios/${studioId}`)).status).toBe(200); // now cached
    expect((await owner.b.del(`/studios/${studioId}/members/${member.id}`)).status).toBe(204);
    expect((await member.b.get(`/studios/${studioId}`)).status).toBe(404);
    expect((await member.b.get('/me')).body.workspaces).toEqual([]);
  });

  it('a demotion removes permissions on the next request', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const member = await t.user();
    await join(owner, studioId, member, 'admin');
    expect((await member.b.get(`/studios/${studioId}/audit-logs`)).status).toBe(200);
    await owner.b.patch(`/studios/${studioId}/members/${member.id}`, { roleKey: 'viewer' });
    expect((await member.b.get(`/studios/${studioId}/audit-logs`)).status).toBe(403);
  });
});

describe('owner-only actions need the password again', () => {
  it('transfers ownership and demotes the previous owner to admin', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const next = await t.user();
    await join(owner, studioId, next, 'editor');
    const wrong = await owner.b.post(`/studios/${studioId}/transfer-ownership`, {
      userId: next.id,
      password: 'nope',
    });
    expect(wrong.status).toBe(400);
    const ok = await owner.b.post(`/studios/${studioId}/transfer-ownership`, {
      userId: next.id,
      password: TEST_PASSWORD,
    });
    expect(ok.status).toBe(204);
    expect((await next.b.get(`/studios/${studioId}`)).body.role).toBe('owner');
    expect((await owner.b.get(`/studios/${studioId}`)).body.role).toBe('admin');
  });

  it('schedules deletion with a 30-day grace period and can cancel it', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    expect((await owner.b.del(`/studios/${studioId}`, { password: 'nope' })).status).toBe(400);
    const del = await owner.b.del(`/studios/${studioId}`, { password: TEST_PASSWORD });
    expect(del.status).toBe(202);
    const days = (Date.parse(del.body.deleteAfter) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect((await owner.b.get(`/studios/${studioId}`)).body.status).toBe('pending_deletion');
    expect((await owner.b.post(`/studios/${studioId}/cancel-deletion`)).status).toBe(204);
    expect((await owner.b.get(`/studios/${studioId}`)).body.status).toBe('active');
  });
});

describe('studio profile and activity', () => {
  it('hides GST details from roles without billing.view and blocks admins from editing them', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const admin = await t.user();
    await join(owner, studioId, admin, 'admin');
    const gst = {
      billingProfile: { legalName: 'Lens Story LLP', gstin: '27ABCDE1234F1Z5', stateCode: '27' },
    };
    expect((await owner.b.patch(`/studios/${studioId}`, gst)).status).toBe(200);
    expect((await admin.b.patch(`/studios/${studioId}`, gst)).status).toBe(403);
    expect((await admin.b.get(`/studios/${studioId}`)).body.billingProfile).toMatchObject({
      gstin: '27ABCDE1234F1Z5',
    });

    const viewer = await t.user();
    await join(owner, studioId, viewer, 'viewer');
    expect((await viewer.b.get(`/studios/${studioId}`)).body.billingProfile).toBeUndefined();
  });

  it('records sensitive actions in a paged studio activity log', async () => {
    const owner = await t.user();
    const studioId = await newStudio(owner);
    const member = await t.user();
    await join(owner, studioId, member, 'viewer');
    await owner.b.patch(`/studios/${studioId}/members/${member.id}`, { roleKey: 'editor' });
    const first = await owner.b.get(`/studios/${studioId}/audit-logs?limit=2`);
    expect(first.body.data.map((a: { action: string }) => a.action)).toEqual([
      'member.role_changed',
      'member.joined',
    ]);
    expect(first.body.page.hasMore).toBe(true);
    const next = await owner.b.get(
      `/studios/${studioId}/audit-logs?limit=2&cursor=${first.body.page.nextCursor}`,
    );
    expect(next.body.data.map((a: { action: string }) => a.action)).toEqual([
      'member.invited',
      'studio.created',
    ]);
    expect(
      (await owner.b.get(`/studios/${studioId}/audit-logs?cursor=tampered.cursor`)).status,
    ).toBe(400);
  });
});

describe('ScopedRepository', () => {
  it('cannot be widened by a filter naming another tenant, and stamps its own tenant on insert', async () => {
    const a = await t.user();
    const b = await t.user();
    const studioA = await newStudio(a);
    const studioB = await newStudio(b);
    const repo = new ScopedRepository<MembershipDoc>(MembershipModel, 'tenantId').forScope({
      type: 'studio',
      id: studioA,
    });
    expect(await repo.find({ tenantId: studioB } as never).lean()).toEqual([]);
    expect(await repo.find({ $or: [{ tenantId: studioB }, {}] } as never).lean()).toHaveLength(1);
    const created = await repo.create({
      tenantId: studioB,
      roleKey: 'viewer',
      userId: b.id,
      roleId: b.id,
    } as never);
    expect(String(created.tenantId)).toBe(studioA);
  });
});
