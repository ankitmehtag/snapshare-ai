import { Router, type Router as ExpressRouter } from 'express';
import { z } from './zod.js';
import type { RouteRegistry } from './routes.js';

export type ReadinessCheck = () => Promise<void>;

const TIMEOUT_MS = 2_000;

async function runCheck(check: ReadinessCheck): Promise<'ok' | 'fail'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

const healthSchema = z.object({ status: z.literal('ok') }).openapi('Health');
const readySchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z.record(z.string(), z.enum(['ok', 'fail'])),
  })
  .openapi('Readiness');

/** Liveness (/health) and readiness (/ready) probes (DEPLOYMENT §8). */
export function healthRoutes(
  registry: RouteRegistry,
  checks: Record<string, ReadinessCheck>,
): ExpressRouter {
  const router = Router();
  registry.mount(router, {
    method: 'get',
    path: '/health',
    scope: 'system',
    summary: 'Liveness probe',
    tags: ['system'],
    responses: { 200: { description: 'Process is alive', schema: healthSchema } },
    handler: (_input, _req, res) => {
      res.json({ status: 'ok' });
    },
  });
  registry.mount(router, {
    method: 'get',
    path: '/ready',
    scope: 'system',
    summary: 'Readiness probe (MongoDB, Redis, Qdrant)',
    tags: ['system'],
    responses: {
      200: { description: 'All dependencies reachable', schema: readySchema },
      503: { description: 'A dependency is unreachable', schema: readySchema },
    },
    handler: async (_input, _req, res) => {
      const names = Object.keys(checks);
      const results = await Promise.all(names.map((n) => runCheck(checks[n]!)));
      const report = Object.fromEntries(names.map((n, i) => [n, results[i]]));
      const ready = results.every((r) => r === 'ok');
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: report });
    },
  });
  return router;
}
