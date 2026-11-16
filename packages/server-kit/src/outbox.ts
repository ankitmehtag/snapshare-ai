import { isQueueName, type QueueName } from '@snapshare/config';
import type { Queue } from 'bullmq';
import mongoose, { Schema, type ClientSession, type Types } from 'mongoose';
import type { Logger } from 'pino';

/**
 * Transactional outbox (ADR-003). State changes and the jobs they trigger are
 * written in the same MongoDB transaction; the relay publishes them to BullMQ.
 */
export interface OutboxDoc {
  _id: Types.ObjectId;
  topic: QueueName;
  payload: Record<string, unknown>;
  status: 'pending' | 'publishing' | 'published';
  attempts: number;
  availableAt: Date;
  leaseUntil?: Date;
  publishedAt?: Date;
  lastError?: string;
}

const outboxSchema = new Schema<OutboxDoc>(
  {
    topic: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'publishing', 'published'],
      default: 'pending',
      required: true,
    },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: () => new Date(), required: true },
    leaseUntil: Date,
    publishedAt: Date,
    lastError: String,
  },
  { collection: 'outbox', timestamps: true, minimize: false },
);

export const OutboxModel =
  (mongoose.models.Outbox as mongoose.Model<OutboxDoc> | undefined) ??
  mongoose.model<OutboxDoc>('Outbox', outboxSchema);

export interface OutboxEntry {
  topic: QueueName;
  payload: Record<string, unknown>;
}

/** Write outbox entries inside the caller's transaction. Requires a session. */
export async function writeOutbox(
  session: ClientSession,
  entries: OutboxEntry[],
): Promise<Types.ObjectId[]> {
  if (!session.inTransaction()) {
    throw new Error('writeOutbox must be called inside a MongoDB transaction');
  }
  for (const e of entries) {
    if (!isQueueName(e.topic)) throw new Error(`Unknown queue "${e.topic}"`);
  }
  const docs = await OutboxModel.insertMany(
    entries.map((e) => ({ topic: e.topic, payload: e.payload })),
    { session },
  );
  return docs.map((d) => d._id);
}

export interface OutboxRelayOptions {
  queueFor: (topic: QueueName) => Queue;
  logger: Logger;
  pollIntervalMs?: number;
  leaseMs?: number;
  retryDelayMs?: number;
}

/**
 * Publishes pending outbox entries to BullMQ with jobId = outbox _id.
 * At-least-once: if the relay dies after queue.add but before marking the entry
 * published, the lease expires, the entry is re-published, and BullMQ dedupes it
 * by jobId (completed jobs are retained 7 days; see KEEP_COMPLETED_SECONDS).
 * Several relay replicas may run safely: entries are claimed atomically.
 */
export class OutboxRelay {
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly retryDelayMs: number;
  private timer: NodeJS.Timeout | undefined;
  private stream: mongoose.mongo.ChangeStream | undefined;
  private draining: Promise<number> | undefined;
  private stopped = true;

  constructor(private readonly opts: OutboxRelayOptions) {
    this.pollIntervalMs = opts.pollIntervalMs ?? 1_000;
    this.leaseMs = opts.leaseMs ?? 30_000;
    this.retryDelayMs = opts.retryDelayMs ?? 5_000;
  }

  /** Claim the next publishable entry (pending, or publishing with an expired lease). */
  async claimNext(now = new Date()): Promise<OutboxDoc | null> {
    return OutboxModel.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', availableAt: { $lte: now } },
          { status: 'publishing', leaseUntil: { $lt: now } },
        ],
      },
      {
        $set: { status: 'publishing', leaseUntil: new Date(now.getTime() + this.leaseMs) },
        $inc: { attempts: 1 },
      },
      { sort: { availableAt: 1 }, returnDocument: 'after' },
    ).lean<OutboxDoc>();
  }

  async publish(doc: OutboxDoc): Promise<void> {
    const queue = this.opts.queueFor(doc.topic);
    await queue.add(doc.topic, doc.payload, { jobId: doc._id.toHexString() });
  }

  async markPublished(doc: OutboxDoc): Promise<void> {
    await OutboxModel.updateOne(
      { _id: doc._id, status: 'publishing' },
      { $set: { status: 'published', publishedAt: new Date() }, $unset: { leaseUntil: 1 } },
    );
  }

  /** Publish everything currently publishable. Returns the number published. */
  drain(): Promise<number> {
    this.draining ??= this.drainOnce().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  private async drainOnce(): Promise<number> {
    let published = 0;
    for (;;) {
      const doc = await this.claimNext();
      if (!doc) return published;
      try {
        await this.publish(doc);
        await this.markPublished(doc);
        published++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.logger.error(
          { outboxId: doc._id, topic: doc.topic, err: message },
          'publish failed',
        );
        await OutboxModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              status: 'pending',
              availableAt: new Date(Date.now() + this.retryDelayMs),
              lastError: message,
            },
            $unset: { leaseUntil: 1 },
          },
        );
      }
    }
  }

  start(): void {
    this.stopped = false;
    const tick = () => {
      if (this.stopped) return;
      this.drain()
        .catch((err: Error) => this.opts.logger.error({ err: err.message }, 'outbox drain failed'))
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(tick, this.pollIntervalMs);
        });
    };
    tick();
    try {
      // Change stream gives near-instant publishing; polling remains the fallback.
      this.stream = OutboxModel.watch([{ $match: { operationType: 'insert' } }]);
      this.stream.on('change', () => void this.drain().catch(() => undefined));
      this.stream.on('error', (err) =>
        this.opts.logger.warn(
          { err: err.message },
          'outbox change stream error; polling continues',
        ),
      );
    } catch (err) {
      this.opts.logger.warn(
        { err: (err as Error).message },
        'change stream unavailable; polling only',
      );
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.stream?.close().catch(() => undefined);
    await this.draining?.catch(() => undefined);
  }
}
