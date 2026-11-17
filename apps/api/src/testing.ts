// Shared helpers for API integration tests only.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from 'mongodb';

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14';
export const TEST_MONGO_BASE = process.env.TEST_MONGO_URL ?? 'mongodb://127.0.0.1:27017';
export const TEST_QDRANT_URL = process.env.TEST_QDRANT_URL ?? 'http://127.0.0.1:6333';
export const TEST_QDRANT_KEY = process.env.QDRANT_API_KEY ?? 'snapshare-dev-qdrant-key';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Applies every migration in order, so tests run against the real indexes. */
export async function applyMigrations(db: Db): Promise<void> {
  const require = createRequire(import.meta.url);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.cjs'))
    .sort();
  for (const file of files) {
    const migration = require(path.join(MIGRATIONS_DIR, file)) as { up: (db: Db) => Promise<void> };
    await migration.up(db);
  }
}
