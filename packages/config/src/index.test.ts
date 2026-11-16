import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DLQ_NAMES,
  EnvValidationError,
  QUEUES,
  baseEnvSchema,
  getQueue,
  isQueueName,
  loadEnv,
  secret,
} from './index.js';

describe('loadEnv', () => {
  const schema = baseEnvSchema.extend({
    PORT: z.coerce.number().int().positive(),
    JWT_SECRET: secret(),
  });

  it('parses and applies defaults', () => {
    const env = loadEnv(schema, { PORT: '4000', JWT_SECRET: 'x'.repeat(32) });
    expect(env).toMatchObject({ NODE_ENV: 'development', LOG_LEVEL: 'info', PORT: 4000 });
  });

  it('fails with every problem listed and without echoing values', () => {
    const leaked = 'super-secret-but-too-short';
    try {
      loadEnv(schema, { PORT: 'abc', JWT_SECRET: leaked });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const e = err as EnvValidationError;
      expect(e.issues).toHaveLength(2);
      expect(e.message).toContain('PORT');
      expect(e.message).toContain('JWT_SECRET');
      expect(e.message).not.toContain(leaked);
    }
  });
});

describe('queue registry', () => {
  it('every queue points at a known DLQ and has sane limits', () => {
    for (const [name, q] of Object.entries(QUEUES)) {
      expect(DLQ_NAMES, name).toContain(q.dlq);
      expect(q.attempts, name).toBeGreaterThan(0);
      expect(q.timeoutMs, name).toBeGreaterThan(0);
      expect(q.concurrency, name).toBeGreaterThan(0);
    }
  });

  it('pages on-call for biometric deletion, data deletion and billing failures', () => {
    expect(QUEUES['ai.face.delete'].alertOnDlq).toBe(true);
    expect(QUEUES['deletion.cascade'].alertOnDlq).toBe(true);
    expect(QUEUES['billing.webhook'].alertOnDlq).toBe(true);
  });

  it('rejects unregistered queues', () => {
    expect(isQueueName('media.process')).toBe(true);
    expect(isQueueName('random.jobs')).toBe(false);
    expect(() => getQueue('random.jobs')).toThrow(/Register it/);
  });
});
