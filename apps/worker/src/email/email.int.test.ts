/**
 * End to end: outbox entry → relay → notify.email → SMTP → Mailpit.
 * Needs `pnpm infra:up` (MongoDB, Valkey, Mailpit).
 */
import { randomBytes } from 'node:crypto';
import { connectMongo, createRedis, OutboxModel, writeOutbox } from '@snapshare/server-kit';
import type { EmailJob } from '@snapshare/types';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorkers } from '../run.js';
import { smtpMailer } from './mailer.js';

const MAILPIT = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/12', {
  forQueues: true,
});
const logger = pino({ level: 'silent' });
const db = `email_test_${randomBytes(3).toString('hex')}`;

interface MailpitSearch {
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
}

async function waitForMail(to: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as MailpitSearch;
    if (body.messages.length) return body.messages[0]!;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${to} within ${timeoutMs} ms`);
}

beforeAll(async () => {
  await connectMongo(
    `${process.env.TEST_MONGO_URL ?? 'mongodb://127.0.0.1:27017'}/${db}?directConnection=true`,
  );
  await OutboxModel.createCollection();
  await redis.flushdb();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  redis.disconnect();
});

describe('notify.email', () => {
  it('delivers a verification email written to the outbox', async () => {
    const mailer = smtpMailer({
      host: process.env.TEST_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.TEST_SMTP_PORT ?? 1025),
      secure: false,
      from: 'SnapShare <no-reply@snapshare.local>',
    });
    const running = await startWorkers({
      roles: ['relay', 'notify'],
      redis,
      logger,
      nodeEnv: 'test',
      readinessChecks: {},
      mailer,
    });
    try {
      const to = `verify_${randomBytes(4).toString('hex')}@example.com`;
      const job: EmailJob = {
        template: 'verify_email',
        to,
        locale: 'hi',
        data: { name: 'Asha', url: 'http://localhost:5173/verify?token=abc' },
      };
      const session = await mongoose.startSession();
      await session.withTransaction(() =>
        writeOutbox(session, [{ topic: 'notify.email', payload: { ...job } }]),
      );
      await session.endSession();

      const message = await waitForMail(to);
      expect(message.Subject).toBe('SnapShare के लिए अपना ईमेल पुष्टि करें');
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      expect(full.Text).toContain('http://localhost:5173/verify?token=abc');
      expect(full.HTML).toContain('lang="hi"');
    } finally {
      await running.stop();
      mailer.close();
    }
  });
});
