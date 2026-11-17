// Public API of the identity module (ARCHITECTURE §4: other modules import only this file).
import type { Logger } from '@snapshare/server-kit';
import type { Workspace } from '@snapshare/types';
import type { RequestHandler, Router } from 'express';
import { Types, type ClientSession } from 'mongoose';
import type { Redis } from 'ioredis';
import { requireAuth, type AccessVerifier } from '../../kernel/auth.js';
import type { RouteRegistry } from '../../kernel/routes.js';
import { usersRepo } from './repositories/users.repo.js';
import { mountAuthRoutes } from './routes/auth.routes.js';
import { createAccessTokens, type AccessTokenKeys } from './services/access-tokens.js';
import { AuthService } from './services/auth.service.js';
import { AuthState } from './services/auth-state.js';
import type { CaptchaVerifier } from './services/captcha.js';
import { verifyPassword, type BreachChecker } from './services/passwords.js';

export { keysFromEnv } from './services/access-tokens.js';
export { turnstileVerifier, type CaptchaVerifier } from './services/captcha.js';
export { hibpChecker, noBreachCheck, type BreachChecker } from './services/passwords.js';

export interface IdentityDeps {
  redis: Redis;
  logger: Logger;
  keys: AccessTokenKeys;
  captcha: CaptchaVerifier;
  breach: BreachChecker;
  appUrl: string;
  cookies: { secure: boolean; domain?: string | undefined };
  ipHashSecret: string;
  /** Workspaces for GET /me, provided by the tenancy module (avoids a module cycle). */
  workspacesFor?: (userId: string) => Promise<Workspace[]>;
}

export interface IdentityModule {
  /** Authenticates requests for every module's routes (sets req.ctx). */
  requireAuth: RequestHandler;
  mount(api: Router, registry: RouteRegistry): void;
}

export async function createIdentityModule(deps: IdentityDeps): Promise<IdentityModule> {
  const tokens = await createAccessTokens(deps.keys);
  const state = new AuthState(deps.redis);
  const service = new AuthService({
    tokens,
    state,
    captcha: deps.captcha,
    breach: deps.breach,
    appUrl: deps.appUrl,
    logger: deps.logger,
    ...(deps.workspacesFor ? { workspacesFor: deps.workspacesFor } : {}),
  });

  const verifier: AccessVerifier = {
    verify: (token) => tokens.verify(token),
    async isRevoked(sessionId) {
      try {
        return await state.isMarkedRevoked(sessionId);
      } catch {
        // Redis down: fall back to the source of truth rather than failing open.
        return service.isSessionRevoked(sessionId);
      }
    },
  };
  const auth = requireAuth(verifier);

  return {
    requireAuth: auth,
    mount(api, registry) {
      mountAuthRoutes(api, registry, {
        service,
        redis: deps.redis,
        requireAuth: auth,
        cookies: deps.cookies,
        ipHashSecret: deps.ipHashSecret,
      });
    },
  };
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  status: string;
}

const summary = (u: Awaited<ReturnType<typeof usersRepo.findById>>): UserSummary | null =>
  u
    ? {
        id: String(u._id),
        email: u.email,
        name: u.name,
        emailVerified: Boolean(u.emailVerifiedAt),
        status: u.status,
      }
    : null;

/** Read-only user facts other modules may need. No password hashes leave this module. */
export const userDirectory = {
  async get(userId: string): Promise<UserSummary | null> {
    return Types.ObjectId.isValid(userId) ? summary(await usersRepo.findById(userId)) : null;
  },
  async getMany(userIds: Types.ObjectId[]): Promise<Map<string, UserSummary>> {
    const users = await usersRepo.findByIds(userIds);
    return new Map(users.map((u) => [String(u._id), summary(u)!]));
  },
  /** Re-authentication for destructive actions (studio delete, ownership transfer). */
  async checkPassword(userId: string, password: string): Promise<boolean> {
    const user = Types.ObjectId.isValid(userId) ? await usersRepo.findById(userId) : null;
    return verifyPassword(user?.passwordHash, password);
  },
  /** Accepting an emailed invitation proves control of the inbox. */
  markEmailVerified(userId: string, session?: ClientSession) {
    return usersRepo.markEmailVerified(new Types.ObjectId(userId), session);
  },
};
