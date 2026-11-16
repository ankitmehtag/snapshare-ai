import { z } from 'zod';

/** Variables every service needs. Service-specific schemas extend this. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** A secret must be long enough to be safe as an HMAC/JWT key. */
export const secret = (minLength = 32) =>
  z.string().min(minLength, `must be at least ${minLength} characters`);

export const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validate environment variables once at startup. A service must refuse to
 * start on invalid config (DEPLOYMENT §6) — callers let this error crash the process.
 * Values are never echoed in the error, so secrets cannot leak into logs.
 */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
