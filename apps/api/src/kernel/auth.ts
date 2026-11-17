import type { AuthContext, PlatformRole } from '@snapshare/types';
import type { Request, RequestHandler } from 'express';
import { AppError } from './errors.js';

export const ACCESS_COOKIE = 'at';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own augmentation point
  namespace Express {
    interface Request {
      /** Set by requireAuth; never built from client-supplied ids (MASTER_SPEC §6). */
      ctx?: AuthContext;
    }
  }
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole;
}

/**
 * Implemented by the identity module; the kernel stays independent of any module.
 * `verify` throws `TokenExpiredError` for an expired token and returns null for any
 * other invalid token. `isRevoked` answers from Redis first, MongoDB as fallback.
 */
export interface AccessVerifier {
  verify(token: string): Promise<AccessClaims | null>;
  isRevoked(sessionId: string): Promise<boolean>;
}

export class TokenExpiredError extends Error {
  constructor() {
    super('access token expired');
    this.name = 'TokenExpiredError';
  }
}

/**
 * Authenticates the request from the `at` cookie (ARCHITECTURE §5.2) and sets
 * `req.ctx`. Studio scope and permissions are added by the tenancy layer (Phase 2B).
 */
export function requireAuth(verifier: AccessVerifier): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = (req.cookies as Record<string, string | undefined> | undefined)?.[
        ACCESS_COOKIE
      ];
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
      let claims: AccessClaims | null;
      try {
        claims = await verifier.verify(token);
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          // The web client refreshes once on this code (API_SPEC §1.3).
          throw new AppError(401, 'TOKEN_EXPIRED', 'Session token expired');
        }
        throw err;
      }
      if (!claims || (await verifier.isRevoked(claims.sessionId))) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
      }
      req.ctx = { ...claims, scope: null, permissions: [] };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** The authenticated context; only valid after requireAuth. */
export function authCtx(req: Request): AuthContext {
  if (!req.ctx) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
  return req.ctx;
}
