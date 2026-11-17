import {
  changeRoleBody,
  createStudioBody,
  inviteBody,
  linkToken,
  paginationQuery,
  reauthBody,
  studioSlug,
  transferOwnershipBody,
  updateStudioBody,
} from '@snapshare/validators';
import type { Request, RequestHandler, Router } from 'express';
import type { Redis } from 'ioredis';
import { authCtx } from '../../../kernel/auth.js';
import { hashIp } from '../../../kernel/client-info.js';
import { rateLimit } from '../../../kernel/rate-limit.js';
import { problemSchema, type RouteDefinition, type RouteRegistry } from '../../../kernel/routes.js';
import { z } from '../../../kernel/zod.js';
import type { ClientMeta, TenancyService } from '../services/tenancy.service.js';

export interface TenancyRoutesDeps {
  service: TenancyService;
  redis: Redis;
  requireAuth: RequestHandler;
  ipHashSecret: string;
}

const id = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const studioParams = z.object({ studioId: id });
const memberParams = z.object({ studioId: id, userId: id });
const invitationParams = z.object({ studioId: id, invitationId: id });
const problem = (description: string) => ({ description, schema: problemSchema });

const workspace = z
  .object({
    type: z.literal('studio'),
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    roleKey: z.string(),
  })
  .openapi('StudioWorkspace');
const member = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    roleKey: z.string(),
    status: z.string(),
    joinedAt: z.string(),
    you: z.boolean(),
  })
  .openapi('Member');
const invitation = z
  .object({
    id: z.string(),
    email: z.string(),
    roleKey: z.string(),
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .openapi('Invitation');

export function mountTenancyRoutes(api: Router, registry: RouteRegistry, deps: TenancyRoutesDeps) {
  const { service } = deps;
  const client = (req: Request): ClientMeta => ({
    ipHash: hashIp(req.ip, deps.ipHashSecret),
    requestId: String(req.id ?? ''),
  });
  const inviteLookupLimit = rateLimit(deps.redis, {
    name: 'invitations.lookup',
    points: 30,
    durationSeconds: 600,
    failOpen: false,
  });

  /** Every studio route: authenticate, then resolve membership + permission. */
  const studio = <P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
    def: Omit<RouteDefinition<P, Q, B>, 'scope' | 'permission' | 'middleware'> & {
      permission: string;
    },
  ) =>
    registry.mount(api, {
      ...def,
      scope: 'studio',
      tags: ['studios'],
      middleware: [deps.requireAuth, service.guard(def.permission)],
    } as RouteDefinition<P, Q, B>);

  // --- user-level (no studio selected yet) ---------------------------------------------

  registry.mount(api, {
    method: 'get',
    path: '/studios/slug-availability',
    scope: 'personal',
    summary: 'Is a studio address free? (ONB-02)',
    tags: ['studios'],
    middleware: [deps.requireAuth],
    request: { query: z.object({ slug: z.string().max(60) }) },
    responses: {
      200: {
        description: 'Availability',
        schema: z.object({
          slug: z.string(),
          available: z.boolean(),
          reason: z.string().optional(),
        }),
      },
    },
    handler: async ({ query }, _req, res) => {
      const parsed = studioSlug.safeParse(query.slug);
      if (!parsed.success) {
        res.json({ slug: query.slug, available: false, reason: parsed.error.issues[0]?.message });
        return;
      }
      res.json({ slug: parsed.data, available: await service.slugAvailable(parsed.data) });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/studios',
    scope: 'personal',
    summary: 'Create a studio; the caller becomes its owner',
    tags: ['studios'],
    middleware: [deps.requireAuth],
    request: { body: createStudioBody },
    responses: {
      201: { description: 'Created', schema: workspace },
      403: problem('Email not verified'),
      409: problem('Address taken'),
    },
    handler: async ({ body }, req, res) => {
      const ctx = authCtx(req);
      const s = await service.createStudio(ctx.userId, body, client(req));
      res
        .status(201)
        .json({ type: 'studio', id: String(s._id), name: s.name, slug: s.slug, roleKey: 'owner' });
    },
  });

  registry.mount(api, {
    method: 'get',
    path: '/invitations/{token}',
    scope: 'public',
    summary: 'Preview an invitation before accepting (AUTH-06)',
    tags: ['invitations'],
    middleware: [inviteLookupLimit],
    request: { params: z.object({ token: linkToken }) },
    responses: {
      200: {
        description: 'Invitation summary',
        schema: z.object({
          studioName: z.string(),
          roleKey: z.string(),
          inviterName: z.string(),
          emailHint: z.string(),
          status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
        }),
      },
      404: problem('Unknown invitation'),
    },
    handler: async ({ params }, _req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await service.previewInvitation(params.token));
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/invitations/{token}/accept',
    scope: 'personal',
    summary: 'Join the studio as the invited (signed-in) user',
    tags: ['invitations'],
    middleware: [deps.requireAuth, inviteLookupLimit],
    request: { params: z.object({ token: linkToken }) },
    responses: {
      200: { description: 'Joined', schema: workspace },
      409: problem('Expired, revoked, used, or sent to a different email'),
    },
    handler: async ({ params }, req, res) => {
      res.json(await service.acceptInvitation(authCtx(req).userId, params.token, client(req)));
    },
  });

  // --- studio-scoped -------------------------------------------------------------------

  studio({
    method: 'get',
    path: '/studios/{studioId}',
    permission: 'studio.view',
    summary: 'Studio profile and your role in it',
    request: { params: studioParams },
    responses: { 200: { description: 'Studio' }, 404: problem('Not a member') },
    handler: async (_input, req, res) => {
      res.json(await service.getStudio(authCtx(req)));
    },
  });

  studio({
    method: 'patch',
    path: '/studios/{studioId}',
    permission: 'studio.settings',
    summary: 'Update profile, contact, colours and (owner) GST details',
    request: { params: studioParams, body: updateStudioBody },
    isolation: { body: () => ({ name: 'Renamed Studio' }) },
    responses: { 200: { description: 'Updated studio' } },
    handler: async ({ body }, req, res) => {
      res.json(await service.updateStudio(authCtx(req), body, client(req)));
    },
  });

  studio({
    method: 'delete',
    path: '/studios/{studioId}',
    permission: 'studio.delete',
    summary: `Schedule deletion after a 30-day grace period (password required)`,
    request: { params: studioParams, body: reauthBody },
    isolation: { body: (fx) => ({ password: fx.password! }) },
    responses: {
      202: {
        description: 'Scheduled',
        schema: z.object({ status: z.literal('pending_deletion'), deleteAfter: z.string() }),
      },
    },
    handler: async ({ body }, req, res) => {
      res.status(202).json(await service.requestDeletion(authCtx(req), body.password, client(req)));
    },
  });

  studio({
    method: 'post',
    path: '/studios/{studioId}/cancel-deletion',
    permission: 'studio.delete',
    summary: 'Cancel a scheduled deletion',
    request: { params: studioParams },
    responses: { 204: { description: 'Cancelled' }, 409: problem('Not scheduled') },
    handler: async (_input, req, res) => {
      await service.cancelDeletion(authCtx(req), client(req));
      res.status(204).end();
    },
  });

  studio({
    method: 'get',
    path: '/studios/{studioId}/members',
    permission: 'team.view',
    summary: 'Team members (ST-40)',
    request: { params: studioParams },
    responses: { 200: { description: 'Members', schema: z.object({ data: z.array(member) }) } },
    handler: async (_input, req, res) => {
      res.json({ data: await service.listMembers(authCtx(req)) });
    },
  });

  studio({
    method: 'patch',
    path: '/studios/{studioId}/members/{userId}',
    permission: 'team.manage',
    summary: "Change a member's role (the last owner can't be demoted)",
    request: { params: memberParams, body: changeRoleBody },
    isolation: { body: () => ({ roleKey: 'editor' }) },
    responses: { 204: { description: 'Changed' }, 409: problem('Last owner') },
    handler: async ({ params, body }, req, res) => {
      await service.changeRole(authCtx(req), params.userId, body.roleKey, client(req));
      res.status(204).end();
    },
  });

  studio({
    method: 'delete',
    path: '/studios/{studioId}/members/{userId}',
    permission: 'team.manage',
    summary: 'Remove a member; access ends on their next request',
    request: { params: memberParams },
    responses: { 204: { description: 'Removed' }, 409: problem('Last owner') },
    handler: async ({ params }, req, res) => {
      await service.removeMember(authCtx(req), params.userId, client(req));
      res.status(204).end();
    },
  });

  studio({
    method: 'get',
    path: '/studios/{studioId}/invitations',
    permission: 'team.view',
    summary: 'Pending invitations',
    request: { params: studioParams },
    responses: {
      200: { description: 'Invitations', schema: z.object({ data: z.array(invitation) }) },
    },
    handler: async (_input, req, res) => {
      res.json({ data: await service.listInvitations(authCtx(req)) });
    },
  });

  studio({
    method: 'post',
    path: '/studios/{studioId}/invitations',
    permission: 'team.manage',
    summary: 'Invite someone by email (uses a team seat)',
    request: { params: studioParams, body: inviteBody },
    isolation: { body: (fx) => ({ email: fx.freshEmail!, roleKey: 'viewer' }) },
    responses: {
      201: { description: 'Invited', schema: invitation },
      409: problem('Already a member'),
      422: problem('No free seats'),
    },
    handler: async ({ body }, req, res) => {
      res.status(201).json(await service.invite(authCtx(req), body, client(req)));
    },
  });

  studio({
    method: 'delete',
    path: '/studios/{studioId}/invitations/{invitationId}',
    permission: 'team.manage',
    summary: 'Revoke a pending invitation',
    request: { params: invitationParams },
    responses: { 204: { description: 'Revoked' }, 404: problem('No such pending invitation') },
    handler: async ({ params }, req, res) => {
      await service.revokeInvitation(authCtx(req), params.invitationId, client(req));
      res.status(204).end();
    },
  });

  studio({
    method: 'post',
    path: '/studios/{studioId}/transfer-ownership',
    permission: 'studio.transfer',
    summary: 'Make another member the owner; you become an admin (password required)',
    request: { params: studioParams, body: transferOwnershipBody },
    isolation: { body: (fx) => ({ userId: fx.userId!, password: fx.password! }) },
    responses: { 204: { description: 'Transferred' } },
    handler: async ({ body }, req, res) => {
      await service.transferOwnership(authCtx(req), body.userId, body.password, client(req));
      res.status(204).end();
    },
  });

  studio({
    method: 'get',
    path: '/studios/{studioId}/roles',
    permission: 'team.view',
    summary: 'Roles and their permissions',
    request: { params: studioParams },
    responses: { 200: { description: 'Roles' } },
    handler: (_input, _req, res) => {
      res.json({ data: service.listRoles() });
    },
  });

  studio({
    method: 'get',
    path: '/studios/{studioId}/audit-logs',
    permission: 'audit.view',
    summary: 'Studio activity, newest first (ST-41)',
    request: { params: studioParams, query: paginationQuery },
    responses: { 200: { description: 'Audit page' } },
    handler: async ({ query }, req, res) => {
      res.json(await service.auditLogs(authCtx(req), query.cursor, query.limit));
    },
  });
}
