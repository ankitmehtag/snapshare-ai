import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Security headers for a JSON API (SECURITY §5). The SPA's own CSP is served by
 * nginx/web; API responses never render HTML, so the API CSP denies everything.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  });
}

/** CORS allowlist with credentials; unknown origins simply get no CORS headers. */
export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin: (origin, cb) => cb(null, origin !== undefined && allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Remaining'],
    maxAge: 600,
  });
}
