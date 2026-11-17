import { baseEnvSchema, bool, loadEnv } from '@snapshare/config';
import { z } from 'zod';

export const workerEnvSchema = baseEnvSchema
  .extend({
    MONGO_URL: z.string().startsWith('mongodb', 'must be a mongodb:// URL'),
    REDIS_URL: z.string().startsWith('redis', 'must be a redis:// URL'),
    /** Internal port for /health and /ready probes (never exposed publicly). */
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4100),
    LOG_PRETTY: bool.default(false),

    // --- Email (notify role; Mailpit locally, any SMTP provider in production — G10) ---
    SMTP_HOST: z.string().min(1).default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(3).default('SnapShare <no-reply@snapshare.local>'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MAIL_FROM.includes('snapshare.local')) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message: 'set a real sender in production',
      });
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source?: Record<string, string | undefined>) =>
  loadEnv(workerEnvSchema, source);
