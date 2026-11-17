// Shared helpers for API integration tests only.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { connectMongo, createRedis, OutboxModel } from '@snapshare/server-kit';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { createApp } from './app.js';
import { createIdentityModule } from './modules/identity/index.js';
import { createTenancyModule } from './modules/tenancy/index.js';

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

// --- Full-app harness for module integration suites ---------------------------------

export const TEST_ORIGIN = 'http://localhost:5173';
/** Obviously fake, low-entropy value for test-only HMAC keys. */
const TEST_SECRET = 'x'.repeat(40);
export const TEST_PASSWORD = 'correct horse battery';

export async function createTestApp(prefix: string) {
  const logger = pino({ level: 'silent' });
  const redis = createRedis(TEST_REDIS_URL);
  const dbName = `${prefix}_${randomBytes(3).toString('hex')}`;
  await connectMongo(`${TEST_MONGO_BASE}/${dbName}?directConnection=true`);
  await applyMigrations(mongoose.connection.db as unknown as Db);
  await OutboxModel.createCollection();
  await redis.flushdb();

  const tenancy = createTenancyModule({
    redis,
    logger,
    appUrl: TEST_ORIGIN,
    cursorSecret: TEST_SECRET,
    ipHashSecret: TEST_SECRET,
  });
  await tenancy.ensureSystemRoles();
  const identity = await createIdentityModule({
    redis,
    logger,
    keys: { kid: 'test' },
    captcha: { verify: async (t) => t === 'captcha-ok' },
    breach: { isBreached: async () => false },
    appUrl: TEST_ORIGIN,
    cookies: { secure: false },
    ipHashSecret: TEST_SECRET,
    workspacesFor: tenancy.workspacesFor,
  });
  const { app, registry } = createApp({
    env: { NODE_ENV: 'test', CORS_ORIGINS: [TEST_ORIGIN], TRUST_PROXY: 1 },
    logger,
    redis,
    readinessChecks: {},
    modules: [identity.mount, tenancy.mount(identity.requireAuth)],
  });

  let ipCounter = 0;
  /** A browser: own cookie jar and IP; CSRF token fetched like the web app does. */
  async function browser() {
    const agent = request.agent(app);
    ipCounter++;
    const ip = `10.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}.7`;
    const csrf = (await agent.get('/api/v1/auth/csrf').set('X-Forwarded-For', ip)).body
      .csrfToken as string;
    const send = (method: 'post' | 'patch' | 'delete', path: string, body?: object) => {
      const r = agent[method](`/api/v1${path}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrf)
        .set('X-Forwarded-For', ip);
      return body ? r.send(body) : r;
    };
    return {
      ip,
      get: (path: string) => agent.get(`/api/v1${path}`).set('X-Forwarded-For', ip),
      post: (path: string, body?: object) => send('post', path, body),
      patch: (path: string, body?: object) => send('patch', path, body),
      del: (path: string, body?: object) => send('delete', path, body),
      call(method: string, path: string, body?: object) {
        return method === 'get' ? this.get(path) : send(method as 'post', path, body);
      },
    };
  }
  type Browser = Awaited<ReturnType<typeof browser>>;

  /** Signs up, marks the email verified (as the emailed link would) and signs in. */
  async function user(opts: { verified?: boolean } = {}) {
    const b = await browser();
    const email = `u_${randomBytes(5).toString('hex')}@example.com`;
    await b.post('/auth/signup', {
      name: `User ${email.slice(2, 8)}`,
      email,
      password: TEST_PASSWORD,
      turnstileToken: 'captcha-ok',
    });
    if (opts.verified ?? true) {
      await mongoose.connection
        .collection('users')
        .updateOne({ email }, { $set: { emailVerifiedAt: new Date() } });
    }
    const login = await b.post('/auth/login', { email, password: TEST_PASSWORD });
    if (login.status !== 204) throw new Error(`login failed: ${login.status}`);
    const me = await b.get('/me');
    return { b, email, id: me.body.id as string } as { b: Browser; email: string; id: string };
  }

  return {
    app,
    registry,
    redis,
    browser,
    user,
    async close() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      redis.disconnect();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
