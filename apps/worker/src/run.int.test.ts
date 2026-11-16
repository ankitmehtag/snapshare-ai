import { createRedis, connectMongo, OutboxModel, writeOutbox } from '@snapshare/server-kit';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorkers } from './run.js';

const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/13', {
  forQueues: true,
});
const logger = pino({ level: 'silent' });
const db = `worker_test_${randomBytes(3).toString('hex')}`;

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

describe('worker roles end to end', () => {
  it('relay + system: an outbox entry written in a transaction is processed', async () => {
    const running = await startWorkers({
      roles: ['relay', 'system'],
      redis,
      logger,
      nodeEnv: 'test',
      readinessChecks: {},
      healthPort: 0,
    });
    const done = new Promise<string>((resolve) =>
      running.workers[0]!.on('completed', (job) => resolve(String(job.id))),
    );
    const session = await mongoose.startSession();
    const [id] = await session.withTransaction(() =>
      writeOutbox(session, [{ topic: 'system.ping', payload: {} }]),
    );
    await session.endSession();
    expect(await done).toBe(id!.toHexString());
    expect(running.idleQueues).toEqual(['export.zip', 'deletion.cascade', 'billing.webhook']);
    await running.stop();
  });

  it('never consumes test-only queues in production', async () => {
    const running = await startWorkers({
      roles: ['system'],
      redis,
      logger,
      nodeEnv: 'production',
      readinessChecks: {},
    });
    expect(running.workers).toHaveLength(0);
    await running.stop();
  });
});
