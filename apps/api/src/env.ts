import { baseEnvSchema, bool, csv, loadEnv, secret } from '@snapshare/config';
import { z } from 'zod';

/** Cloudflare's publicly documented always-pass test secret; not a credential. */
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA'; // nosemgrep: generic.secrets.security.detected-generic-secret.detected-generic-secret

export const apiEnvSchema = baseEnvSchema
  .extend({
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

    // --- Auth (Phase 2, API_SPEC §1.2) ---
    /** Public web origin, used to build links in emails (verify, reset). */
    APP_URL: z.url(),
    /**
     * Ed25519 private key (PKCS#8 PEM, base64-encoded) signing access tokens.
     * Required in production (all API replicas must share it). In development and
     * tests an ephemeral key is generated at start: refresh tokens are opaque and
     * stored in MongoDB, so sessions survive a restart anyway.
     */
    AUTH_JWT_PRIVATE_KEY: z.string().optional(),
    AUTH_JWT_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/)
      .default('k1'),
    /** Rotation: base64 JSON {kid: spkiPem} of retired keys still accepted for verification. */
    AUTH_JWT_PREVIOUS_KEYS: z.string().optional(),
    /** Keys IP addresses before storage (sessions.device.ipHash, audit). */
    IP_HASH_SECRET: secret(),
    /** Secure cookies need HTTPS; local http://localhost development turns it off. */
    COOKIE_SECURE: bool.optional(),
    COOKIE_DOMAIN: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().min(1).default(TURNSTILE_TEST_SECRET),
    /** Breached-password check (HIBP k-anonymity range API, free). */
    HIBP_ENABLED: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.AUTH_JWT_PRIVATE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_JWT_PRIVATE_KEY'],
        message: 'required in production',
      });
    }
    if (env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET_KEY'],
        message: 'the always-pass test key is not allowed in production',
      });
    }
    if (env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source?: Record<string, string | undefined>) =>
  loadEnv(apiEnvSchema, source);
