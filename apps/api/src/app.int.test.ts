import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { createRedis } from '@snapshare/server-kit';
import { MongoClient } from 'mongodb';
import { pino } from 'pino';
import { io as connectSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { errorHandler } from './kernel/errors.js';
import { rateLimit } from './kernel/rate-limit.js';
import { findUnregisteredRoutes } from './kernel/routes.js';
import { createSocketServer } from './socket.js';
import { TEST_MONGO_BASE, TEST_QDRANT_KEY, TEST_QDRANT_URL, TEST_REDIS_URL } from './testing.js';

const logger = pino({ level: 'silent' });
const redis = createRedis(TEST_REDIS_URL);
const ORIGIN = 'http://localhost:5173';

const env = { NODE_ENV: 'test' as const, CORS_ORIGINS: [ORIGIN], TRUST_PROXY: 0 };
const qdrantCheck = async () => {
  const res = await fetch(new URL('/readyz', TEST_QDRANT_URL), {
    headers: { 'api-key': TEST_QDRANT_KEY },
  });
  if (!res.ok) throw new Error(String(res.status));
};

beforeAll(async () => {
  await redis.flushdb();
});
afterAll(() => {
  redis.disconnect();
});

describe('api app', () => {
  const { app, registry } = createApp({
    env,
    logger,
    redis,
    readinessChecks: { redis: async () => void (await redis.ping()), qdrant: qdrantCheck },
  });

  it('serves liveness and readiness against real services', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', checks: { redis: 'ok', qdrant: 'ok' } });
  });

  it('reports not_ready (503) when a dependency fails', async () => {
    const { app: broken } = createApp({
      env,
      logger,
      redis,
      readinessChecks: {
        redis: async () => void (await redis.ping()),
        mongo: async () => {
          throw new Error('down');
        },
      },
    });
    const res = await request(broken).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ redis: 'ok', mongo: 'fail' });
  });

  it('returns problem+json with a request id for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('sets security headers and never advertises the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS with credentials only for allowlisted origins', async () => {
    const ok = await request(app).get('/health').set('Origin', ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('mounts every route through the registry with scope metadata', async () => {
    expect(findUnregisteredRoutes(app.router.stack)).toEqual([]);
    expect(registry.routes.every((r) => r.scope)).toBe(true);
    const doc = await request(app).get('/openapi.json');
    expect(doc.body.openapi).toBe('3.1.0');
    expect(Object.keys(doc.body.paths)).toEqual(
      expect.arrayContaining(['/health', '/ready', '/openapi.json']),
    );
  });

  it('does not expose the OpenAPI document in production', async () => {
    const { app: prod } = createApp({
      env: { ...env, NODE_ENV: 'production' },
      logger,
      redis,
      readinessChecks: {},
    });
    expect((await request(prod).get('/openapi.json')).status).toBe(404);
  });
});

describe('rate limiting (Redis)', () => {
  it('returns 429 with Retry-After once the limit is used up', async () => {
    const app = express();
    app.get(
      '/limited',
      rateLimit(redis, {
        name: `test.${randomBytes(3).toString('hex')}`,
        points: 2,
        durationSeconds: 60,
        failOpen: false,
      }),
      (_req, res) => {
        res.send('ok');
      },
    );
    app.use(errorHandler(logger));
    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
    const third = await request(app).get('/limited');
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('RATE_LIMITED');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('socket.io', () => {
  let http: Server;
  let close: () => Promise<void>;

  beforeAll(async () => {
    http = createServer();
    const io = createSocketServer(http, { redis, corsOrigins: [ORIGIN], logger });
    await new Promise<void>((r) => http.listen(0, r));
    close = () => new Promise((r) => io.close(() => r()));
  });
  afterAll(async () => {
    await close();
  });

  it('rejects unauthenticated connections until Phase 2 auth exists', async () => {
    const { port } = http.address() as AddressInfo;
    const client = connectSocket(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
    });
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    client.close();
    expect(err.message).toBe('UNAUTHENTICATED');
  });
});

describe('startup', () => {
  it('refuses to start with invalid configuration and names the problem', () => {
    const result = spawnSync('pnpm', ['exec', 'tsx', 'src/main.ts'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, MONGO_URL: 'not-a-url' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid environment configuration');
    expect(result.stderr).toContain('MONGO_URL');
    expect(result.stderr).toContain('CURSOR_SECRET');
  });
});

describe('migrations', () => {
  const db = `migrate_test_${randomBytes(3).toString('hex')}`;
  const url = `${TEST_MONGO_BASE}/${db}?directConnection=true`;

  afterAll(async () => {
    const client = await MongoClient.connect(url);
    await client.db(db).dropDatabase();
    await client.close();
  });

  it('creates the outbox and audit log indexes (idempotently)', async () => {
    const run = () =>
      execFileSync('pnpm', ['exec', 'migrate-mongo', 'up', '-f', 'migrate-mongo-config.cjs'], {
        env: { ...process.env, MONGO_URL: url },
        encoding: 'utf8',
      });
    expect(run()).toContain('20261117000000-outbox-and-audit-indexes.cjs');
    run(); // second run is a no-op

    const client = await MongoClient.connect(url);
    const outbox = await client.db(db).collection('outbox').indexes();
    const audit = await client.db(db).collection('auditLogs').indexes();
    await client.close();
    expect(outbox.map((i) => i.name)).toEqual(
      expect.arrayContaining(['status_availableAt', 'status_leaseUntil', 'publishedAt_ttl']),
    );
    expect(outbox.find((i) => i.name === 'publishedAt_ttl')?.expireAfterSeconds).toBe(604800);
    expect(audit.map((i) => i.name)).toEqual(
      expect.arrayContaining(['scope_at', 'actor_at', 'action_at', 'at_ttl']),
    );
  });
});
