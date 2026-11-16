import { baseEnvSchema, bool, loadEnv } from '@snapshare/config';
import { z } from 'zod';

export const workerEnvSchema = baseEnvSchema.extend({
  MONGO_URL: z.string().startsWith('mongodb', 'must be a mongodb:// URL'),
  REDIS_URL: z.string().startsWith('redis', 'must be a redis:// URL'),
  /** Internal port for /health and /ready probes (never exposed publicly). */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4100),
  LOG_PRETTY: bool.default(false),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source?: Record<string, string | undefined>) =>
  loadEnv(workerEnvSchema, source);
