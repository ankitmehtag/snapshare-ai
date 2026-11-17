import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { AppError } from './errors.js';

export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Sets a fresh double-submit token. The cookie is readable by our JS on purpose. */
export function issueCsrfToken(res: Response, base: CookieOptions): string {
  const token = randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE, token, { ...base, httpOnly: false, path: '/' });
  return token;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * CSRF defence for every state-changing request (API_SPEC §1.2, SECURITY §3.1):
 * 1. Origin (or Referer) must be one of our origins: blocks cross-site forms even
 *    if a cookie leaked; requests with neither header are refused.
 * 2. Double-submit: the `csrf` cookie must equal the `X-CSRF-Token` header. A
 *    cross-site page cannot read our cookie, so it cannot forge the header.
 * Applies to login and signup too (login CSRF).
 */
export function csrfProtection(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin') ?? originOf(req.get('referer'));
    if (!origin || !allowed.has(origin)) {
      return next(new AppError(403, 'CSRF_FAILED', 'Request origin not allowed'));
    }
    const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.[CSRF_COOKIE];
    const header = req.get(CSRF_HEADER);
    if (!cookie || !header || !sameToken(cookie, header)) {
      return next(
        new AppError(403, 'CSRF_FAILED', 'Security token missing or invalid', {
          detail: 'Reload the page and try again.',
        }),
      );
    }
    next();
  };
}

function originOf(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
