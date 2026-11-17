import { baseEnvSchema, bool, csv, loadEnv, secret } from '@snapshare/config';
import { z } from 'zod';

export const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  /** Internal Prometheus port; never routed by the edge proxy. 0 disables it. */
  METRICS_PORT: z.coerce.number().int().min(0).default(9464),
  MONGO_URL: z.string().startsWith('mongodb', 'must be a mongodb:// URL'),
  REDIS_URL: z.string().startsWith('redis', 'must be a redis:// URL'),
  QDRANT_URL: z.url(),
  QDRANT_API_KEY: secret(16),
  /** Comma-separated browser origins allowed to call the API with credentials. */
  CORS_ORIGINS: csv,
  CURSOR_SECRET: secret(),
  /** Number of trusted reverse-proxy hops (Cloudflare + nginx in production = 2). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_PRETTY: bool.default(false),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source?: Record<string, string | undefined>) =>
  loadEnv(apiEnvSchema, source);
