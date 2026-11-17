// Public API of the identity module (ARCHITECTURE §4: other modules import only this file).
import type { Logger } from '@snapshare/server-kit';
import type { RequestHandler, Router } from 'express';
import type { Redis } from 'ioredis';
import { requireAuth, type AccessVerifier } from '../../kernel/auth.js';
import type { RouteRegistry } from '../../kernel/routes.js';
import { mountAuthRoutes } from './routes/auth.routes.js';
import { createAccessTokens, type AccessTokenKeys } from './services/access-tokens.js';
import { AuthService } from './services/auth.service.js';
import { AuthState } from './services/auth-state.js';
import type { CaptchaVerifier } from './services/captcha.js';
import type { BreachChecker } from './services/passwords.js';

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
