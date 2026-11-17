import { createHash } from 'node:crypto';
import {
  changePasswordBody,
  emailOnlyBody,
  forgotPasswordBody,
  loginBody,
  resetPasswordBody,
  signupBody,
  updateMeBody,
  verifyEmailBody,
} from '@snapshare/validators';
import type { CookieOptions, Request, RequestHandler, Response, Router } from 'express';
import type { Redis } from 'ioredis';
import { ACCESS_COOKIE, authCtx } from '../../../kernel/auth.js';
import { clientInfo } from '../../../kernel/client-info.js';
import { issueCsrfToken } from '../../../kernel/csrf.js';
import { rateLimit } from '../../../kernel/rate-limit.js';
import { problemSchema, type RouteRegistry } from '../../../kernel/routes.js';
import { z } from '../../../kernel/zod.js';
import type { AuthService, ClientMeta, IssuedSession } from '../services/auth.service.js';

export const REFRESH_COOKIE = 'rt';
/** The refresh token is only ever sent to the auth endpoints. */
const REFRESH_PATH = '/api/v1/auth';

export interface AuthRoutesDeps {
  service: AuthService;
  redis: Redis;
  requireAuth: RequestHandler;
  cookies: { secure: boolean; domain?: string | undefined };
  ipHashSecret: string;
}

const accepted = z.object({ status: z.literal('check_email') }).openapi('Accepted');
const meSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    name: z.string(),
    locale: z.enum(['en', 'hi']),
    timezone: z.string(),
    platformRole: z.enum(['none', 'support', 'admin']),
    workspaces: z.array(
      z.object({
        type: z.enum(['studio', 'personal']),
        id: z.string(),
        name: z.string(),
        slug: z.string().optional(),
        roleKey: z.string().optional(),
      }),
    ),
  })
  .openapi('Me');
const sessionSchema = z
  .object({
    id: z.string(),
    browser: z.string(),
    os: z.string(),
    createdAt: z.string(),
    lastSeenAt: z.string(),
    current: z.boolean(),
  })
  .openapi('Session');
const problem = (description: string) => ({ description, schema: problemSchema });

export function mountAuthRoutes(api: Router, registry: RouteRegistry, deps: AuthRoutesDeps) {
  const { service, redis } = deps;
  const base: CookieOptions = {
    secure: deps.cookies.secure,
    sameSite: 'lax',
    ...(deps.cookies.domain ? { domain: deps.cookies.domain } : {}),
  };

  const meta = (req: Request): ClientMeta => ({
    ip: req.ip,
    ...clientInfo(req, deps.ipHashSecret),
    requestId: String(req.id ?? ''),
  });

  const setSession = (res: Response, s: IssuedSession) => {
    const maxAge = Math.max(0, s.sessionExpiresAt.getTime() - Date.now());
    // The cookie outlives the 10-minute JWT on purpose: an expired JWT must still
    // reach the API so it can answer TOKEN_EXPIRED and the client refreshes.
    res.cookie(ACCESS_COOKIE, s.accessToken, { ...base, httpOnly: true, path: '/', maxAge });
    if (s.refreshToken) {
      res.cookie(REFRESH_COOKIE, s.refreshToken, {
        ...base,
        httpOnly: true,
        path: REFRESH_PATH,
        maxAge,
      });
    }
  };
  const clearSession = (res: Response) => {
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
  };
  const cookie = (req: Request, name: string) =>
    (req.cookies as Record<string, string | undefined> | undefined)?.[name];

  // Rate-limit classes (API_SPEC §1.6). Security-sensitive ones fail closed.
  const emailHash = (req: Request) =>
    createHash('sha256')
      .update(String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase())
      .digest('hex')
      .slice(0, 24);
  const loginPerIpEmail = rateLimit(redis, {
    name: 'auth.login.ip_email',
    points: 5,
    durationSeconds: 60,
    key: (req) => `${req.ip}:${emailHash(req)}`,
    failOpen: false,
  });
  const loginPerIp = rateLimit(redis, {
    name: 'auth.login.ip',
    points: 20,
    durationSeconds: 3600,
    failOpen: false,
  });
  const signupLimit = rateLimit(redis, {
    name: 'auth.signup',
    points: 5,
    durationSeconds: 3600,
    failOpen: false,
  });
  const forgotLimit = rateLimit(redis, {
    name: 'auth.forgot',
    points: 5,
    durationSeconds: 3600,
    failOpen: false,
  });
  const resendLimit = rateLimit(redis, {
    name: 'auth.resend',
    points: 5,
    durationSeconds: 3600,
    failOpen: false,
  });
  const tokenLimit = rateLimit(redis, {
    name: 'auth.token',
    points: 20,
    durationSeconds: 600,
    failOpen: false,
  });
  const refreshLimit = rateLimit(redis, {
    name: 'auth.refresh',
    points: 60,
    durationSeconds: 60,
    failOpen: true,
  });

  // --- /auth -------------------------------------------------------------------------

  registry.mount(api, {
    method: 'get',
    path: '/auth/csrf',
    scope: 'public',
    summary: 'Issue the CSRF double-submit cookie',
    tags: ['auth'],
    responses: {
      200: { description: 'Token issued', schema: z.object({ csrfToken: z.string() }) },
    },
    handler: (_input, _req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ csrfToken: issueCsrfToken(res, base) });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/signup',
    scope: 'public',
    summary: 'Create an account and send a verification email',
    tags: ['auth'],
    middleware: [signupLimit],
    request: { body: signupBody },
    responses: {
      202: {
        description: 'Check your inbox (same response for existing emails)',
        schema: accepted,
      },
      400: problem('Invalid input or breached password'),
      403: problem('Captcha failed'),
    },
    handler: async ({ body }, req, res) => {
      await service.signup(body, meta(req));
      res.status(202).json({ status: 'check_email' });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/verify-email',
    scope: 'public',
    summary: 'Verify an email address from the emailed link',
    tags: ['auth'],
    middleware: [tokenLimit],
    request: { body: verifyEmailBody },
    responses: {
      200: {
        description: 'Verified',
        schema: z.object({ status: z.enum(['verified', 'already_verified']) }),
      },
      400: problem('Invalid, used or expired link (meta.reason)'),
    },
    handler: async ({ body }, _req, res) => {
      res.json({ status: await service.verifyEmail(body.token) });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/resend-verification',
    scope: 'public',
    summary: 'Send a new verification email',
    tags: ['auth'],
    middleware: [resendLimit],
    request: { body: emailOnlyBody },
    responses: { 202: { description: 'Sent if the account needs it', schema: accepted } },
    handler: async ({ body }, _req, res) => {
      await service.resendVerification(body.email);
      res.status(202).json({ status: 'check_email' });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/login',
    scope: 'public',
    summary: 'Sign in with email and password; sets session cookies',
    tags: ['auth'],
    middleware: [loginPerIp, loginPerIpEmail],
    request: { body: loginBody },
    responses: {
      204: { description: 'Signed in' },
      401: problem('Wrong email or password'),
      403: problem('Captcha required (CAPTCHA_REQUIRED) or account inactive'),
      423: problem('Locked after too many failures (Retry-After)'),
    },
    handler: async ({ body }, req, res) => {
      setSession(res, await service.login(body, meta(req)));
      res.status(204).end();
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/refresh',
    scope: 'public',
    summary: 'Rotate the refresh token and issue a new access token',
    tags: ['auth'],
    middleware: [refreshLimit],
    responses: { 204: { description: 'Refreshed' }, 401: problem('Sign in again') },
    handler: async (_input, req, res) => {
      try {
        setSession(res, await service.refresh(cookie(req, REFRESH_COOKIE), meta(req)));
      } catch (err) {
        clearSession(res);
        throw err;
      }
      res.status(204).end();
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/logout',
    scope: 'public',
    summary: 'Sign out of this device',
    tags: ['auth'],
    responses: { 204: { description: 'Signed out' } },
    handler: async (_input, req, res) => {
      await service.logout(cookie(req, REFRESH_COOKIE), undefined, meta(req));
      clearSession(res);
      res.status(204).end();
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/forgot-password',
    scope: 'public',
    summary: 'Email a password reset link',
    tags: ['auth'],
    middleware: [forgotLimit],
    request: { body: forgotPasswordBody },
    responses: {
      202: {
        description: 'Sent if the account exists (same response either way)',
        schema: accepted,
      },
      403: problem('Captcha failed'),
    },
    handler: async ({ body }, req, res) => {
      await service.forgotPassword(body.email, body.turnstileToken, meta(req));
      res.status(202).json({ status: 'check_email' });
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/auth/reset-password',
    scope: 'public',
    summary: 'Set a new password from the emailed link; signs out every device',
    tags: ['auth'],
    middleware: [tokenLimit],
    request: { body: resetPasswordBody },
    responses: {
      204: { description: 'Password changed' },
      400: problem('Invalid link or breached password'),
    },
    handler: async ({ body }, req, res) => {
      await service.resetPassword(body.token, body.password, meta(req));
      clearSession(res);
      res.status(204).end();
    },
  });

  // --- /me ---------------------------------------------------------------------------

  const auth = [deps.requireAuth];

  registry.mount(api, {
    method: 'get',
    path: '/me',
    scope: 'personal',
    summary: 'Current user, workspaces and platform role',
    tags: ['me'],
    middleware: auth,
    responses: { 200: { description: 'Profile', schema: meSchema }, 401: problem('Signed out') },
    handler: async (_input, req, res) => {
      res.json(await service.me(authCtx(req).userId));
    },
  });

  registry.mount(api, {
    method: 'patch',
    path: '/me',
    scope: 'personal',
    summary: 'Update name, language or time zone',
    tags: ['me'],
    middleware: auth,
    request: { body: updateMeBody },
    responses: { 200: { description: 'Updated profile', schema: meSchema } },
    handler: async ({ body }, req, res) => {
      res.json(await service.updateMe(authCtx(req).userId, body));
    },
  });

  registry.mount(api, {
    method: 'post',
    path: '/me/password',
    scope: 'personal',
    summary: 'Change password (signs out other devices)',
    tags: ['me'],
    middleware: [...auth, tokenLimit],
    request: { body: changePasswordBody },
    responses: { 204: { description: 'Changed' }, 400: problem('Wrong current password') },
    handler: async ({ body }, req, res) => {
      const ctx = authCtx(req);
      await service.changePassword(ctx.userId, ctx.sessionId, body, meta(req));
      res.status(204).end();
    },
  });

  registry.mount(api, {
    method: 'get',
    path: '/me/sessions',
    scope: 'personal',
    summary: 'Signed-in devices',
    tags: ['me'],
    middleware: auth,
    responses: {
      200: { description: 'Sessions', schema: z.object({ data: z.array(sessionSchema) }) },
    },
    handler: async (_input, req, res) => {
      const ctx = authCtx(req);
      res.json({ data: await service.listSessions(ctx.userId, ctx.sessionId) });
    },
  });

  registry.mount(api, {
    method: 'delete',
    path: '/me/sessions/{sessionId}',
    scope: 'personal',
    summary: 'Sign out one device',
    tags: ['me'],
    middleware: auth,
    request: { params: z.object({ sessionId: z.string().regex(/^[a-f0-9]{24}$/) }) },
    responses: { 204: { description: 'Revoked' }, 404: problem('No such session') },
    handler: async ({ params }, req, res) => {
      const ctx = authCtx(req);
      await service.revokeSession(ctx.userId, params.sessionId, meta(req));
      if (params.sessionId === ctx.sessionId) clearSession(res);
      res.status(204).end();
    },
  });

  registry.mount(api, {
    method: 'delete',
    path: '/me/sessions',
    scope: 'personal',
    summary: 'Sign out every other device',
    tags: ['me'],
    middleware: auth,
    responses: {
      200: { description: 'Revoked', schema: z.object({ revoked: z.number().int() }) },
    },
    handler: async (_input, req, res) => {
      const ctx = authCtx(req);
      res.json({
        revoked: await service.revokeOtherSessions(ctx.userId, ctx.sessionId, meta(req)),
      });
    },
  });
}
