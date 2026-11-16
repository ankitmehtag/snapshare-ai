// Shared helpers for integration tests only (not exported from the package index).
import { randomBytes } from 'node:crypto';

export const TEST_MONGO_URL = (db: string) =>
  `${process.env.TEST_MONGO_URL ?? 'mongodb://127.0.0.1:27017'}/${db}?directConnection=true`;
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

export const uniqueName = (prefix: string) => `${prefix}_${randomBytes(4).toString('hex')}`;

export async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Condition not met within ${timeoutMs} ms`);
}
