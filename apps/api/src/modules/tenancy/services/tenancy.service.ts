import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_PLAN } from '@snapshare/config';
import { writeOutbox, type Logger } from '@snapshare/server-kit';
import type { AuthContext, EmailJob, Workspace } from '@snapshare/types';
import { decodeCursor, encodeCursor } from '@snapshare/validators/server';
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { Types } from 'mongoose';
import { authCtx } from '../../../kernel/auth.js';
import { AppError } from '../../../kernel/errors.js';
import { inTransaction } from '../../../kernel/transaction.js';
import { listAuditForScope, recordAudit } from '../../audit/index.js';
import { userDirectory } from '../../identity/index.js';
import {
  invitationLookup,
  invitations,
  membershipLookup,
  memberships,
  rolesRepo,
  studiosRepo,
  type StudioDoc,
} from '../repositories/tenancy.repo.js';
import { ROLE_KEYS, ROLE_RANK, SYSTEM_ROLES, isRoleKey, type RoleKey } from './system-roles.js';

const MEMBERSHIP_TTL_SECONDS = 300;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DELETION_GRACE_DAYS = 30;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const notFound = () => AppError.notFound('Studio');
const conflict = (title: string, reason: string) =>
  new AppError(409, 'STATE_INVALID', title, { meta: { reason } });

/** r***@example.com: enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

interface ResolvedMembership {
  roleKey: RoleKey;
  permissions: string[];
  studioStatus: StudioDoc['status'];
}

export interface ClientMeta {
  ipHash: string;
  requestId?: string;
}

export interface TenancyServiceDeps {
  redis: Redis;
  appUrl: string;
  cursorSecret: string;
  logger: Logger;
  /** Seat limit per studio; the default plan until billing ships (Phase 6). */
  seatLimit?: (studioId: string) => number;
}

/**
 * Studios, membership resolution and team management (API_SPEC §2.2, SECURITY §3.2).
 * Every studio route goes through `guard()`: a non-member gets 404 (the studio's
 * existence is not revealed), a member without the permission gets 403.
 */
export class TenancyService {
  constructor(private readonly deps: TenancyServiceDeps) {}

  // --- roles & resolution ------------------------------------------------------------

  /** Upserts the code-defined system roles (idempotent; runs at API start). */
  async ensureSystemRoles(): Promise<void> {
    for (const key of ROLE_KEYS) {
      await rolesRepo.upsertSystem(key, SYSTEM_ROLES[key].name, SYSTEM_ROLES[key].permissions);
    }
  }

  private cacheKey = (studioId: string, userId: string) => `mbr:${studioId}:${userId}`;

  /** Called on every membership change so removal bites on the next request. */
  async clearMembershipCache(studioId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await this.deps.redis.del(...userIds.map((u) => this.cacheKey(studioId, u)));
  }

  async resolve(userId: string, studioId: string): Promise<ResolvedMembership | null> {
    if (!Types.ObjectId.isValid(studioId)) return null;
    const key = this.cacheKey(studioId, userId);
    try {
      const cached = await this.deps.redis.get(key);
      if (cached) return cached === 'none' ? null : (JSON.parse(cached) as ResolvedMembership);
    } catch (err) {
      this.deps.logger.warn({ err: (err as Error).message }, 'membership cache unavailable');
    }

    const [membership, studio] = await Promise.all([
      membershipLookup.findFor(userId, studioId),
      studiosRepo.findById(studioId),
    ]);
    let resolved: ResolvedMembership | null = null;
    if (membership?.status === 'active' && studio && isRoleKey(membership.roleKey)) {
      const role = await rolesRepo.findById(membership.roleId);
      resolved = {
        roleKey: membership.roleKey,
        permissions: role?.permissions ?? [],
        studioStatus: studio.status,
      };
    }
    await this.deps.redis
      .set(key, resolved ? JSON.stringify(resolved) : 'none', 'EX', MEMBERSHIP_TTL_SECONDS)
      .catch(() => undefined);
    return resolved;
  }

  /**
   * Route guard for /studios/{studioId}/... (ARCHITECTURE §5.2). The path id is only a
   * selector; scope comes from the resolved membership. Use after requireAuth.
   */
  guard(permission: string): RequestHandler {
    return async (req, _res, next) => {
      try {
        const ctx = authCtx(req);
        const studioId = String(req.params.studioId ?? '');
        const m = await this.resolve(ctx.userId, studioId);
        if (!m) throw notFound();
        if (m.studioStatus === 'suspended') {
          throw new AppError(403, 'FORBIDDEN', 'This studio is suspended');
        }
        if (permission !== 'member' && !m.permissions.includes(permission)) {
          throw new AppError(403, 'FORBIDDEN', 'Your role does not allow this', {
            meta: { permission },
          });
        }
        req.ctx = {
          ...ctx,
          scope: { type: 'studio', id: studioId },
          role: m.roleKey,
          permissions: m.permissions,
        };
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  async workspacesFor(userId: string): Promise<Workspace[]> {
    const ms = await membershipLookup.listForUser(userId);
    if (!ms.length) return [];
    const studios = new Map(
      (await studiosRepo.findByIds(ms.map((m) => m.tenantId))).map((s) => [String(s._id), s]),
    );
    return ms.flatMap((m) => {
      const s = studios.get(String(m.tenantId));
      return s && s.status !== 'suspended'
        ? [
            {
              type: 'studio' as const,
              id: String(s._id),
              name: s.name,
              slug: s.slug,
              roleKey: m.roleKey,
            },
          ]
        : [];
    });
  }

  // --- studios -----------------------------------------------------------------------

  async slugAvailable(slug: string): Promise<boolean> {
    return !(await studiosRepo.slugTaken(slug));
  }

  async createStudio(
    userId: string,
    input: { name: string; slug: string },
    client: ClientMeta,
  ): Promise<StudioDoc> {
    const user = await userDirectory.get(userId);
    if (!user?.emailVerified) {
      throw new AppError(403, 'FORBIDDEN', 'Verify your email before creating a studio', {
        meta: { reason: 'email_unverified' },
      });
    }
    const owner = await rolesRepo.findSystem('owner');
    if (!owner) throw new Error('system roles missing: ensureSystemRoles() not run');
    try {
      return await inTransaction(async (s) => {
        const studio = await studiosRepo.create(
          {
            name: input.name,
            slug: input.slug,
            ownerUserId: new Types.ObjectId(userId),
            contact: { email: user.email },
          },
          s,
        );
        await memberships.forScope({ type: 'studio', id: String(studio._id) }).create(
          {
            userId: new Types.ObjectId(userId),
            roleId: owner._id,
            roleKey: 'owner',
            status: 'active',
          },
          s,
        );
        await this.audit(
          'studio.created',
          userId,
          String(studio._id),
          client,
          { slug: input.slug },
          s,
        );
        return studio;
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new AppError(409, 'DUPLICATE', 'That studio address is taken', {
          errors: [{ path: 'slug', message: 'That address is taken' }],
        });
      }
      throw err;
    }
  }

  async getStudio(ctx: AuthContext) {
    const studio = await studiosRepo.findById(scopeId(ctx));
    if (!studio) throw notFound();
    return { ...toStudioView(studio, ctx), seats: await this.seatUsage(ctx) };
  }

  /** Seats = active members + pending invitations (ST-40 usage meter). */
  private async seatUsage(ctx: AuthContext) {
    const [members, pending] = await Promise.all([
      memberships.forScope(ctx.scope!).countDocuments({ status: 'active' }),
      invitations
        .forScope(ctx.scope!)
        .countDocuments({ status: 'pending', expiresAt: { $gt: new Date() } }),
    ]);
    return { used: members + pending, limit: this.seatLimit(scopeId(ctx)) };
  }

  async updateStudio(
    ctx: AuthContext,
    patch: {
      name?: string | undefined;
      contact?: Record<string, string | undefined> | undefined;
      branding?: Record<string, string | undefined> | undefined;
      billingProfile?: Record<string, string | undefined> | undefined;
    },
    client: ClientMeta,
  ) {
    if (patch.billingProfile && !ctx.permissions.includes('billing.manage')) {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can change billing details', {
        meta: { permission: 'billing.manage' },
      });
    }
    const set: Record<string, unknown> = {};
    if (patch.name) set.name = patch.name;
    for (const group of ['contact', 'branding', 'billingProfile'] as const) {
      for (const [k, v] of Object.entries(patch[group] ?? {})) {
        if (v !== undefined) set[`${group}.${k}`] = v;
      }
    }
    const studio = await studiosRepo.update(scopeId(ctx), set);
    if (!studio) throw notFound();
    await this.audit('studio.updated', ctx.userId, scopeId(ctx), client, {
      fields: Object.keys(set).join(','),
    });
    return toStudioView(studio, ctx);
  }

  async requestDeletion(ctx: AuthContext, password: string, client: ClientMeta) {
    await this.reauth(ctx.userId, password);
    const deletionRequestedAt = new Date();
    await studiosRepo.setStatus(scopeId(ctx), 'pending_deletion', deletionRequestedAt);
    await this.audit('studio.deletion_requested', ctx.userId, scopeId(ctx), client);
    return {
      status: 'pending_deletion' as const,
      deleteAfter: new Date(
        deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000,
      ).toISOString(),
    };
  }

  async cancelDeletion(ctx: AuthContext, client: ClientMeta) {
    const studio = await studiosRepo.findById(scopeId(ctx));
    if (studio?.status !== 'pending_deletion') {
      throw conflict('This studio is not scheduled for deletion', 'not_pending');
    }
    await studiosRepo.setStatus(scopeId(ctx), 'active', null);
    await this.audit('studio.deletion_cancelled', ctx.userId, scopeId(ctx), client);
  }

  // --- team --------------------------------------------------------------------------

  async listMembers(ctx: AuthContext) {
    const ms = await memberships
      .forScope(ctx.scope!)
      .find({})
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    const users = await userDirectory.getMany(ms.map((m) => m.userId));
    return ms.map((m) => {
      const u = users.get(String(m.userId));
      return {
        userId: String(m.userId),
        name: u?.name ?? 'Unknown user',
        email: u?.email ?? '',
        roleKey: m.roleKey,
        status: m.status,
        joinedAt: m.createdAt.toISOString(),
        you: String(m.userId) === ctx.userId,
      };
    });
  }

  async listInvitations(ctx: AuthContext) {
    const list = await invitations
      .forScope(ctx.scope!)
      .find({ status: 'pending', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return list.map((i) => ({
      id: String(i._id),
      email: i.email,
      roleKey: i.roleKey,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }));
  }

  async invite(ctx: AuthContext, input: { email: string; roleKey: RoleKey }, client: ClientMeta) {
    this.assertCanGrant(ctx, input.roleKey);
    const scope = ctx.scope!;
    const studio = await studiosRepo.findById(scope.id);
    if (!studio) throw notFound();

    const existingUser = await this.findUserIdByEmail(ctx, input.email);
    if (existingUser) {
      throw new AppError(409, 'DUPLICATE', 'This person is already a member', {
        errors: [{ path: 'email', message: 'Already a member of this studio' }],
      });
    }

    const token = randomBytes(32).toString('base64url');
    const inviter = await userDirectory.get(ctx.userId);
    const invitation = await inTransaction(async (s) => {
      const scoped = invitations.forScope(scope);
      // Re-inviting replaces the previous pending invitation (a fresh link).
      await scoped.updateMany(
        { email: input.email, status: 'pending' },
        { $set: { status: 'revoked' } },
        s,
      );
      const seats =
        (await memberships.forScope(scope).countDocuments({ status: 'active' }, s)) +
        (await scoped.countDocuments({ status: 'pending', expiresAt: { $gt: new Date() } }, s));
      const limit = this.seatLimit(scope.id);
      if (seats >= limit) {
        throw new AppError(422, 'QUOTA_EXCEEDED', 'Your plan has no free team seats', {
          meta: { metric: 'seats', limit, used: seats },
        });
      }
      const created = await scoped.create(
        {
          kind: 'studio_member',
          email: input.email,
          roleKey: input.roleKey,
          tokenHash: sha256(token),
          invitedBy: new Types.ObjectId(ctx.userId),
          status: 'pending',
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
        s,
      );
      const job: EmailJob = {
        template: 'studio_invite',
        to: input.email,
        locale: 'en',
        data: {
          studioName: studio.name,
          inviterName: inviter?.name ?? 'A teammate',
          roleName: SYSTEM_ROLES[input.roleKey].name,
          url: `${this.deps.appUrl}/invite/${token}`,
        },
      };
      await writeOutbox(s, [{ topic: 'notify.email', payload: { ...job } }]);
      await this.audit(
        'member.invited',
        ctx.userId,
        scope.id,
        client,
        { roleKey: input.roleKey },
        s,
        {
          type: 'invitation',
          id: String(created._id),
        },
      );
      return created;
    });
    return {
      id: String(invitation._id),
      email: invitation.email,
      roleKey: invitation.roleKey,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  async revokeInvitation(ctx: AuthContext, invitationId: string, client: ClientMeta) {
    if (!Types.ObjectId.isValid(invitationId)) throw AppError.notFound('Invitation');
    const r = await invitations
      .forScope(ctx.scope!)
      .updateOne(
        { _id: new Types.ObjectId(invitationId), status: 'pending' },
        { $set: { status: 'revoked' } },
      );
    if (!r.modifiedCount) throw AppError.notFound('Invitation');
    await this.audit('invitation.revoked', ctx.userId, scopeId(ctx), client, undefined, undefined, {
      type: 'invitation',
      id: invitationId,
    });
  }

  /** AUTH-06 preview: safe to show before sign-in (no full email, no ids). */
  async previewInvitation(token: string) {
    const inv = await invitationLookup.findByTokenHash(sha256(token));
    if (!inv?.target.tenantId) throw AppError.notFound('Invitation');
    const [studio, inviter] = await Promise.all([
      studiosRepo.findById(inv.target.tenantId),
      userDirectory.get(String(inv.invitedBy)),
    ]);
    if (!studio) throw AppError.notFound('Invitation');
    const status = inv.status === 'pending' && inv.expiresAt <= new Date() ? 'expired' : inv.status;
    return {
      studioName: studio.name,
      roleKey: inv.roleKey,
      inviterName: inviter?.name ?? 'A teammate',
      emailHint: maskEmail(inv.email),
      status,
    };
  }

  async acceptInvitation(userId: string, token: string, client: ClientMeta) {
    const inv = await invitationLookup.findByTokenHash(sha256(token));
    if (!inv?.target.tenantId) throw AppError.notFound('Invitation');
    const studioId = String(inv.target.tenantId);
    if (inv.status === 'accepted' && String(inv.acceptedBy) === userId) {
      return this.workspaceOf(studioId, userId);
    }
    if (inv.status !== 'pending') throw conflict('This invitation is no longer valid', inv.status);
    if (inv.expiresAt <= new Date()) throw conflict('This invitation has expired', 'expired');

    const user = await userDirectory.get(userId);
    if (!user || user.email !== inv.email) {
      throw new AppError(409, 'STATE_INVALID', 'This invitation was sent to a different email', {
        meta: { reason: 'email_mismatch', invitedEmail: maskEmail(inv.email) },
      });
    }
    if (!isRoleKey(inv.roleKey)) throw conflict('This invitation is no longer valid', 'role');
    const role = await rolesRepo.findSystem(inv.roleKey);
    if (!role) throw new Error('system roles missing');

    await inTransaction(async (s) => {
      const accepted = await invitationLookup.markAccepted(inv._id, new Types.ObjectId(userId), s);
      if (!accepted.modifiedCount) throw conflict('This invitation is no longer valid', 'used');
      const scoped = memberships.forScope({ type: 'studio', id: studioId });
      if (!(await scoped.countDocuments({ userId: new Types.ObjectId(userId) }, s))) {
        await scoped.create(
          {
            userId: new Types.ObjectId(userId),
            roleId: role._id,
            roleKey: inv.roleKey,
            status: 'active',
            invitedBy: inv.invitedBy,
          },
          s,
        );
      }
      await userDirectory.markEmailVerified(userId, s);
      await this.audit('member.joined', userId, studioId, client, { roleKey: inv.roleKey }, s);
    });
    await this.clearMembershipCache(studioId, [userId]);
    return this.workspaceOf(studioId, userId);
  }

  async changeRole(ctx: AuthContext, targetUserId: string, roleKey: RoleKey, client: ClientMeta) {
    const target = await this.memberOrNotFound(ctx, targetUserId);
    this.assertCanManage(ctx, target.roleKey as RoleKey);
    this.assertCanGrant(ctx, roleKey, true);
    if (target.roleKey === roleKey) return;
    const role = await rolesRepo.findSystem(roleKey);
    if (!role) throw new Error('system roles missing');
    await inTransaction(async (s) => {
      const scoped = memberships.forScope(ctx.scope!);
      if (
        target.roleKey === 'owner' &&
        (await scoped.countDocuments({ roleKey: 'owner', status: 'active' }, s)) <= 1
      ) {
        throw conflict('A studio needs at least one owner', 'last_owner');
      }
      await scoped.updateOne({ _id: target._id }, { $set: { roleId: role._id, roleKey } }, s);
      await this.audit(
        'member.role_changed',
        ctx.userId,
        scopeId(ctx),
        client,
        { from: target.roleKey, to: roleKey },
        s,
        { type: 'user', id: targetUserId },
      );
    });
    await this.clearMembershipCache(scopeId(ctx), [targetUserId]);
  }

  async removeMember(ctx: AuthContext, targetUserId: string, client: ClientMeta) {
    const target = await this.memberOrNotFound(ctx, targetUserId);
    this.assertCanManage(ctx, target.roleKey as RoleKey);
    await inTransaction(async (s) => {
      const scoped = memberships.forScope(ctx.scope!);
      if (
        target.roleKey === 'owner' &&
        (await scoped.countDocuments({ roleKey: 'owner', status: 'active' }, s)) <= 1
      ) {
        throw conflict('A studio needs at least one owner', 'last_owner');
      }
      await scoped.deleteOne({ _id: target._id }, s);
      await this.audit(
        'member.removed',
        ctx.userId,
        scopeId(ctx),
        client,
        { roleKey: target.roleKey },
        s,
        {
          type: 'user',
          id: targetUserId,
        },
      );
    });
    // Access ends on the member's next request (SECURITY §3.2).
    await this.clearMembershipCache(scopeId(ctx), [targetUserId]);
  }

  async transferOwnership(
    ctx: AuthContext,
    targetUserId: string,
    password: string,
    client: ClientMeta,
  ) {
    if (ctx.role !== 'owner')
      throw new AppError(403, 'FORBIDDEN', 'Only an owner can transfer ownership');
    await this.reauth(ctx.userId, password);
    if (targetUserId === ctx.userId) throw conflict('You already own this studio', 'self');
    const target = await this.memberOrNotFound(ctx, targetUserId);
    if (target.status !== 'active') throw conflict('That member is not active', 'inactive');
    const [owner, admin] = await Promise.all([
      rolesRepo.findSystem('owner'),
      rolesRepo.findSystem('admin'),
    ]);
    if (!owner || !admin) throw new Error('system roles missing');
    await inTransaction(async (s) => {
      const scoped = memberships.forScope(ctx.scope!);
      await scoped.updateOne(
        { _id: target._id },
        { $set: { roleId: owner._id, roleKey: 'owner' } },
        s,
      );
      await scoped.updateOne(
        { userId: new Types.ObjectId(ctx.userId) },
        { $set: { roleId: admin._id, roleKey: 'admin' } },
        s,
      );
      await studiosRepo.update(scopeId(ctx), { ownerUserId: new Types.ObjectId(targetUserId) }, s);
      await this.audit(
        'studio.ownership_transferred',
        ctx.userId,
        scopeId(ctx),
        client,
        undefined,
        s,
        {
          type: 'user',
          id: targetUserId,
        },
      );
    });
    await this.clearMembershipCache(scopeId(ctx), [targetUserId, ctx.userId]);
  }

  listRoles() {
    return ROLE_KEYS.map((key) => ({
      key,
      name: SYSTEM_ROLES[key].name,
      permissions: SYSTEM_ROLES[key].permissions,
      system: true,
    }));
  }

  async auditLogs(ctx: AuthContext, cursor: string | undefined, limit: number) {
    const after = cursor ? decodeCursor(cursor, this.deps.cursorSecret) : null;
    if (cursor && !after) throw new AppError(400, 'VALIDATION_FAILED', 'Invalid cursor');
    const rows = await listAuditForScope(
      scopeId(ctx),
      after ? { at: new Date(Number(after.s)), id: after.id } : undefined,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const actors = await userDirectory.getMany(
      page.flatMap((r) => (r.actor.userId ? [r.actor.userId] : [])),
    );
    const last = page.at(-1);
    return {
      data: page.map((r) => ({
        id: String(r._id),
        at: r.at.toISOString(),
        action: r.action,
        actor: r.actor.userId
          ? {
              userId: String(r.actor.userId),
              name: actors.get(String(r.actor.userId))?.name ?? 'Unknown',
            }
          : null,
        target: r.target ?? null,
        meta: r.meta ?? {},
      })),
      page: {
        hasMore: rows.length > limit,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ s: last.at.getTime(), id: String(last._id) }, this.deps.cursorSecret)
            : null,
      },
    };
  }

  // --- helpers -----------------------------------------------------------------------

  private seatLimit(studioId: string) {
    return this.deps.seatLimit?.(studioId) ?? DEFAULT_PLAN.limits.seats;
  }

  private async reauth(userId: string, password: string) {
    if (!(await userDirectory.checkPassword(userId, password))) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Password is incorrect', {
        errors: [{ path: 'password', message: 'Password is incorrect' }],
      });
    }
  }

  private async memberOrNotFound(ctx: AuthContext, userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw AppError.notFound('Member');
    const m = await memberships
      .forScope(ctx.scope!)
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();
    if (!m) throw AppError.notFound('Member');
    return m;
  }

  private async findUserIdByEmail(ctx: AuthContext, email: string) {
    const ms = await memberships.forScope(ctx.scope!).find({}).limit(500).lean();
    const users = await userDirectory.getMany(ms.map((m) => m.userId));
    return [...users.values()].find((u) => u.email === email)?.id;
  }

  /** Nobody may grant a role above their own; only owners may grant owner. */
  private assertCanGrant(ctx: AuthContext, roleKey: RoleKey, allowOwner = false) {
    const mine = ROLE_RANK[(ctx.role ?? 'viewer') as RoleKey];
    if (
      ROLE_RANK[roleKey] > mine ||
      (roleKey === 'owner' && (!allowOwner || ctx.role !== 'owner'))
    ) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot grant a role above your own', {
        meta: { roleKey },
      });
    }
  }

  /** Admins manage everyone except owners; owners manage everyone. */
  private assertCanManage(ctx: AuthContext, targetRole: RoleKey) {
    if (ctx.role === 'owner') return;
    if (
      targetRole === 'owner' ||
      ROLE_RANK[targetRole] > ROLE_RANK[(ctx.role ?? 'viewer') as RoleKey]
    ) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot manage this member');
    }
  }

  private async workspaceOf(studioId: string, userId: string): Promise<Workspace> {
    const ws = (await this.workspacesFor(userId)).find((w) => w.id === studioId);
    if (!ws) throw notFound();
    return ws;
  }

  private audit(
    action: string,
    actorUserId: string,
    studioId: string,
    client: ClientMeta,
    meta?: Record<string, string | number | boolean>,
    session?: Parameters<typeof recordAudit>[1],
    target?: { type: string; id: string },
  ) {
    return recordAudit(
      {
        action,
        actorUserId,
        scope: { type: 'studio', id: studioId },
        ipHash: client.ipHash,
        ...(client.requestId ? { requestId: client.requestId } : {}),
        ...(meta ? { meta } : {}),
        ...(target ? { target } : {}),
      },
      session,
    );
  }
}

function scopeId(ctx: AuthContext): string {
  if (ctx.scope?.type !== 'studio') throw new Error('studio scope missing: route lacks guard()');
  return ctx.scope.id;
}

function toStudioView(s: StudioDoc, ctx: AuthContext) {
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    status: s.status,
    deletionRequestedAt: s.deletionRequestedAt?.toISOString() ?? null,
    contact: s.contact ?? {},
    branding: { primaryColor: s.branding?.primaryColor, accentColor: s.branding?.accentColor },
    // GST details are for people who can see billing (DATABASE_SCHEMA 🔒).
    billingProfile: ctx.permissions.includes('billing.view') ? (s.billingProfile ?? {}) : undefined,
    role: ctx.role,
    permissions: ctx.permissions,
  };
}
