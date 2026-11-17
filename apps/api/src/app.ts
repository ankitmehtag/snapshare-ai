import cookieParser from 'cookie-parser';
import express, { Router, type Express } from 'express';
import type { Redis } from 'ioredis';
import { pinoHttp } from 'pino-http';
import type { Logger } from '@snapshare/server-kit';
import type { ApiEnv } from './env.js';
import { errorHandler, notFoundHandler } from './kernel/errors.js';
import { healthRoutes, type ReadinessCheck } from './kernel/health.js';
import type { ApiMetrics } from './kernel/metrics.js';
import { buildOpenApiDocument } from './kernel/openapi.js';
import { rateLimit } from './kernel/rate-limit.js';
import { genRequestId } from './kernel/request-id.js';
import { RouteRegistry } from './kernel/routes.js';
import { corsPolicy, securityHeaders } from './kernel/security.js';
import { csrfProtection } from './kernel/csrf.js';

export interface AppDeps {
  env: Pick<ApiEnv, 'NODE_ENV' | 'CORS_ORIGINS' | 'TRUST_PROXY'>;
  logger: Logger;
  redis: Redis;
  readinessChecks: Record<string, ReadinessCheck>;
  metrics?: ApiMetrics;
  /** Feature modules, mounted under /api/v1 (identity from Phase 2). */
  modules?: ((api: Router, registry: RouteRegistry) => void)[];
}

export function createApp(deps: AppDeps): { app: Express; registry: RouteRegistry } {
  const app = express();
  const registry = new RouteRegistry();

  app.disable('x-powered-by');
  app.set('trust proxy', deps.env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: genRequestId,
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  if (deps.metrics) app.use(deps.metrics.middleware());
  app.use(securityHeaders());
  app.use(corsPolicy(deps.env.CORS_ORIGINS));

  // Probes stay outside rate limiting so orchestrators never get throttled.
  app.use(healthRoutes(registry, deps.readinessChecks));

  // Default per-IP limit for all API traffic (API_SPEC §1.6). Route classes with
  // stricter limits add their own limiter in their route definitions.
  app.use(
    rateLimit(deps.redis, { name: 'default.ip', points: 600, durationSeconds: 60, failOpen: true }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = Router();
  // Every state-changing API request must pass Origin + double-submit CSRF checks.
  api.use(csrfProtection(deps.env.CORS_ORIGINS));
  for (const mount of deps.modules ?? []) mount(api, registry);
  app.use('/api/v1', api);

  if (deps.env.NODE_ENV !== 'production') {
    const docs = Router();
    registry.mount(docs, {
      method: 'get',
      path: '/openapi.json',
      scope: 'system',
      summary: 'OpenAPI document (non-production only)',
      tags: ['system'],
      responses: { 200: { description: 'OpenAPI 3.1 document' } },
      handler: (_input, _req, res) => {
        res.json(buildOpenApiDocument(registry));
      },
    });
    app.use(docs);
  }

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return { app, registry };
}
