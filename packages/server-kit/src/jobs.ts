import { getQueue, type QueueDefinition, type QueueName } from '@snapshare/config';
import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';

const DAY_SECONDS = 24 * 60 * 60;

/** Completed jobs are kept 7 days so outbox replays within that window dedupe by jobId (ADR-003). */
export const KEEP_COMPLETED_SECONDS = 7 * DAY_SECONDS;
const KEEP_FAILED_SECONDS = 30 * DAY_SECONDS;

export class JobTimeoutError extends Error {
  constructor(queue: string, ms: number) {
    super(`Job in "${queue}" exceeded its ${ms} ms timeout`);
    this.name = 'JobTimeoutError';
  }
}

/** Producer handle for a registered queue, with the registry's retry policy as defaults. */
export function createQueue(name: QueueName, connection: ConnectionOptions): Queue {
  const def = getQueue(name);
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: def.attempts,
      backoff: { type: def.backoff.type, delay: def.backoff.delayMs },
      removeOnComplete: { age: KEEP_COMPLETED_SECONDS },
      removeOnFail: { age: KEEP_FAILED_SECONDS },
    },
  });
}

export interface DeadLetter {
  queue: string;
  jobId: string;
  name: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

export type JobProcessor<T> = (job: Job<T>, signal: AbortSignal) => Promise<unknown>;

export interface CreateWorkerOptions {
  connection: ConnectionOptions;
  logger: Logger;
  nodeEnv: 'development' | 'test' | 'production';
  /** Override the registry concurrency (e.g. per-deployment tuning). */
  concurrency?: number;
}

/**
 * Consumer for a registered queue. Enforces the registry timeout, and copies jobs
 * that exhausted every attempt to the queue's DLQ (spec §19: never ignore failed jobs).
 */
export function createWorker<T>(
  name: QueueName,
  processor: JobProcessor<T>,
  opts: CreateWorkerOptions,
): { worker: Worker<T>; deadLetters: Queue } {
  const def: QueueDefinition = getQueue(name);
  if (def.testOnly && opts.nodeEnv === 'production') {
    throw new Error(`Queue "${name}" is test-only and cannot run in production`);
  }
  const log = opts.logger.child({ queue: name });
  const deadLetters = new Queue(def.dlq, { connection: opts.connection });

  const worker = new Worker<T>(
    name,
    async (job) => {
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new JobTimeoutError(name, def.timeoutMs));
        }, def.timeoutMs);
      });
      try {
        return await Promise.race([processor(job, controller.signal), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    { connection: opts.connection, concurrency: opts.concurrency ?? def.concurrency },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const final = job.attemptsMade >= (job.opts.attempts ?? 1);
    log.warn(
      { jobId: job.id, attemptsMade: job.attemptsMade, final, err: err.message },
      'job failed',
    );
    if (!final) return;
    const letter: DeadLetter = {
      queue: name,
      jobId: String(job.id),
      name: job.name,
      data: job.data,
      failedReason: err.message,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    };
    // ":" is not allowed in BullMQ custom job ids.
    deadLetters
      .add(name, letter, { jobId: `${name}--${job.id}`, removeOnComplete: false })
      .then(() => {
        const level = def.alertOnDlq ? 'error' : 'warn';
        log[level]({ jobId: job.id, alert: def.alertOnDlq }, 'job moved to dead-letter queue');
      })
      .catch((dlqErr: Error) =>
        log.error({ jobId: job.id, err: dlqErr.message }, 'failed to write dead letter'),
      );
  });
  worker.on('error', (err) => log.error({ err: err.message }, 'worker error'));

  return { worker, deadLetters };
}
