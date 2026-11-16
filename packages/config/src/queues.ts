/**
 * Single registry of every background job queue (ARCHITECTURE §6.5).
 * Spec §19: no uncontrolled background jobs — a queue that is not listed here
 * cannot be created (workers and the outbox relay look queues up by name).
 */

export type QueueOwner =
  'kernel' | 'media' | 'ai' | 'notifications' | 'sharing' | 'personal' | 'billing' | 'admin';

export interface QueueDefinition {
  /** Owning API module; the only module allowed to enqueue directly. */
  owner: QueueOwner;
  /** Total attempts including the first. */
  attempts: number;
  backoff: { type: 'exponential' | 'fixed'; delayMs: number };
  /** Hard per-job timeout enforced by the worker. */
  timeoutMs: number;
  /** Default concurrency per worker process (tuned per deployment). */
  concurrency: number;
  /** Dead-letter queue receiving jobs that exhausted all attempts. */
  dlq: DlqName;
  /** Page the on-call immediately when a job lands in the DLQ. */
  alertOnDlq: boolean;
  /** Test-only queues are refused by workers when NODE_ENV=production. */
  testOnly?: boolean;
}

export const DLQ_NAMES = [
  'media.dlq',
  'ai.dlq',
  'notify.dlq',
  'system.dlq',
  'billing.dlq',
] as const;
export type DlqName = (typeof DLQ_NAMES)[number];

const MIN = 60_000;

export const QUEUES = {
  'media.process': {
    owner: 'media',
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: 5 * MIN,
    concurrency: 4,
    dlq: 'media.dlq',
    alertOnDlq: false,
  },
  'media.video': {
    owner: 'media',
    attempts: 3,
    backoff: { type: 'exponential', delayMs: MIN },
    timeoutMs: 30 * MIN,
    concurrency: 1,
    dlq: 'media.dlq',
    alertOnDlq: false,
  },
  'ai.face.index': {
    owner: 'ai',
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: 10 * MIN,
    concurrency: 2,
    dlq: 'ai.dlq',
    alertOnDlq: false,
  },
  'ai.face.match': {
    owner: 'ai',
    attempts: 3,
    backoff: { type: 'fixed', delayMs: 2_000 },
    timeoutMs: 2 * MIN,
    concurrency: 8,
    dlq: 'ai.dlq',
    alertOnDlq: false,
  },
  'ai.face.delete': {
    owner: 'ai',
    attempts: 10,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: 10 * MIN,
    concurrency: 4,
    dlq: 'ai.dlq',
    alertOnDlq: true,
  },
  'notify.email': {
    owner: 'notifications',
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: MIN,
    concurrency: 20,
    dlq: 'notify.dlq',
    alertOnDlq: false,
  },
  'notify.sms': {
    owner: 'notifications',
    attempts: 3,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: MIN,
    concurrency: 10,
    dlq: 'notify.dlq',
    alertOnDlq: false,
  },
  'notify.inapp': {
    owner: 'notifications',
    attempts: 5,
    backoff: { type: 'exponential', delayMs: 5_000 },
    timeoutMs: 30_000,
    concurrency: 20,
    dlq: 'notify.dlq',
    alertOnDlq: false,
  },
  'export.zip': {
    owner: 'sharing',
    attempts: 3,
    backoff: { type: 'exponential', delayMs: MIN },
    timeoutMs: 60 * MIN,
    concurrency: 2,
    dlq: 'system.dlq',
    alertOnDlq: false,
  },
  'deletion.cascade': {
    owner: 'kernel',
    attempts: 10,
    backoff: { type: 'exponential', delayMs: MIN },
    timeoutMs: 60 * MIN,
    concurrency: 2,
    dlq: 'system.dlq',
    alertOnDlq: true,
  },
  'billing.webhook': {
    owner: 'billing',
    attempts: 8,
    backoff: { type: 'exponential', delayMs: 30_000 },
    timeoutMs: 2 * MIN,
    concurrency: 4,
    dlq: 'billing.dlq',
    alertOnDlq: true,
  },
  'system.ping': {
    owner: 'kernel',
    attempts: 3,
    backoff: { type: 'fixed', delayMs: 100 },
    timeoutMs: 10_000,
    concurrency: 1,
    dlq: 'system.dlq',
    alertOnDlq: false,
    testOnly: true,
  },
} as const satisfies Record<string, QueueDefinition>;

export type QueueName = keyof typeof QUEUES;

export function isQueueName(name: string): name is QueueName {
  return Object.hasOwn(QUEUES, name);
}

export function getQueue(name: string): QueueDefinition {
  if (!isQueueName(name)) {
    throw new Error(`Unknown queue "${name}". Register it in packages/config/src/queues.ts.`);
  }
  return QUEUES[name];
}
