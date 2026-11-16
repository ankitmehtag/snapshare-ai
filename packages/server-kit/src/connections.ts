import { Redis } from 'ioredis';
import mongoose from 'mongoose';

/**
 * Connect Mongoose. Indexes are managed by migrations (DATABASE_SCHEMA §15), so
 * autoIndex is off: a model definition never silently builds an index in production.
 */
export async function connectMongo(url: string): Promise<typeof mongoose> {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  mongoose.set('strictQuery', true);
  return mongoose.connect(url, { serverSelectionTimeoutMS: 5_000 });
}

/** Redis/Valkey client. BullMQ requires maxRetriesPerRequest = null on its connections. */
export function createRedis(url: string, opts: { forQueues?: boolean } = {}): Redis {
  return new Redis(url, {
    lazyConnect: false,
    ...(opts.forQueues ? { maxRetriesPerRequest: null } : { maxRetriesPerRequest: 3 }),
  });
}
