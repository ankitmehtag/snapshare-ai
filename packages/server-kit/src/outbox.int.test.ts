import type { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectMongo, createRedis } from './connections.js';
import { createQueue, createWorker } from './jobs.js';
import { OutboxModel, OutboxRelay, writeOutbox } from './outbox.js';
import { TEST_MONGO_URL, TEST_REDIS_URL, uniqueName, waitFor } from './testing.js';

const logger = pino({ level: 'silent' });
let redis: Redis;
let queue: Queue;
const workers: Worker[] = [];
const queues: Queue[] = [];

beforeAll(async () => {
  await connectMongo(TEST_MONGO_URL(uniqueName('outbox_test')));
  await OutboxModel.createCollection();
  redis = createRedis(TEST_REDIS_URL, { forQueues: true });
  await redis.flushdb();
  queue = createQueue('system.ping', redis);
  queues.push(queue);
});

beforeEach(async () => {
  await OutboxModel.deleteMany({});
  await redis.flushdb();
});

afterEach(async () => {
  // Each test owns its workers; a leftover worker would consume the next test's jobs.
  await Promise.all(workers.splice(0).map((w) => w.close()));
});

afterAll(async () => {
  await Promise.all(queues.map((q) => q.close()));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  redis.disconnect();
});

const relay = (leaseMs = 30_000) =>
  new OutboxRelay({ queueFor: () => queue, logger, leaseMs, pollIntervalMs: 50 });

describe('writeOutbox', () => {
  it('commits the outbox entry with the transaction', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await writeOutbox(session, [{ topic: 'system.ping', payload: { n: 1 } }]);
    });
    await session.endSession();
    expect(await OutboxModel.countDocuments({ status: 'pending' })).toBe(1);
  });

  it('writes nothing when the transaction aborts', async () => {
    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await writeOutbox(session, [{ topic: 'system.ping', payload: { n: 1 } }]);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');
    await session.endSession();
    expect(await OutboxModel.countDocuments()).toBe(0);
  });

  it('refuses to run outside a transaction and rejects unknown queues', async () => {
    const session = await mongoose.startSession();
    await expect(writeOutbox(session, [{ topic: 'system.ping', payload: {} }])).rejects.toThrow(
      /inside a MongoDB transaction/,
    );
    await session.withTransaction(async () => {
      await expect(
        // @ts-expect-error — unknown topic must be rejected at runtime too
        writeOutbox(session, [{ topic: 'not.registered', payload: {} }]),
      ).rejects.toThrow(/Unknown queue/);
    });
    await session.endSession();
  });
});

describe('OutboxRelay', () => {
  it('delivers a job exactly once even when the relay crashes mid-publish', async () => {
    const processed: string[] = [];
    const { worker, deadLetters } = createWorker<{ n: number }>(
      'system.ping',
      async (job) => {
        processed.push(String(job.id));
      },
      { connection: redis, logger, nodeEnv: 'test' },
    );
    workers.push(worker);
    queues.push(deadLetters);

    const session = await mongoose.startSession();
    await session.withTransaction(() =>
      writeOutbox(session, [{ topic: 'system.ping', payload: { n: 1 } }]),
    );
    await session.endSession();

    // Relay #1 claims and publishes, then "crashes" before marking the entry published.
    const crashed = relay(200);
    const doc = await crashed.claimNext();
    expect(doc).not.toBeNull();
    await crashed.publish(doc!);
    await waitFor(() => processed.length === 1);

    // After the lease expires, relay #2 re-claims and re-publishes the same entry.
    await new Promise((r) => setTimeout(r, 250));
    expect(await relay(200).drain()).toBe(1);
    expect(await OutboxModel.countDocuments({ status: 'published' })).toBe(1);

    await new Promise((r) => setTimeout(r, 300));
    expect(processed).toEqual([doc!._id.toHexString()]);
  });

  it('publishes new entries automatically once started', async () => {
    const r = relay();
    r.start();
    const session = await mongoose.startSession();
    await session.withTransaction(() =>
      writeOutbox(session, [
        { topic: 'system.ping', payload: { n: 1 } },
        { topic: 'system.ping', payload: { n: 2 } },
      ]),
    );
    await session.endSession();
    await waitFor(async () => (await OutboxModel.countDocuments({ status: 'published' })) === 2);
    await r.stop();
    expect(await queue.getJobCountByTypes('waiting', 'active', 'completed')).toBe(2);
  });
});

describe('dead-letter queue', () => {
  it('moves a job to its DLQ after the configured attempts', async () => {
    const name = uniqueName('fail');
    let calls = 0;
    const { worker, deadLetters } = createWorker(
      'system.ping',
      async () => {
        calls++;
        throw new Error('always fails');
      },
      { connection: redis, logger, nodeEnv: 'test' },
    );
    workers.push(worker);
    queues.push(deadLetters);

    await queue.add(name, { n: 1 }, { jobId: name });
    await waitFor(async () => (await deadLetters.getJobCountByTypes('waiting')) === 1);
    const [letter] = await deadLetters.getJobs(['waiting']);
    expect(calls).toBe(3); // registry: system.ping attempts = 3
    expect(letter?.data).toMatchObject({
      queue: 'system.ping',
      jobId: name,
      failedReason: 'always fails',
      attemptsMade: 3,
    });
  });

  it('refuses to run test-only queues in production', () => {
    expect(() =>
      createWorker('system.ping', async () => undefined, {
        connection: redis,
        logger,
        nodeEnv: 'production',
      }),
    ).toThrow(/test-only/);
  });
});
