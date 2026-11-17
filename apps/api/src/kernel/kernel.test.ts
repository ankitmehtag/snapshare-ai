import express, { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadApiEnv } from '../env.js';
import { AppError, errorHandler, notFoundHandler } from './errors.js';
import { genRequestId } from './request-id.js';
import { RouteRegistry, findUnregisteredRoutes } from './routes.js';

const logger = pino({ level: 'silent' });

function testApp(mount: (router: Router, registry: RouteRegistry) => void) {
  const app = express();
  const registry = new RouteRegistry();
  const router = Router();
  app.use(express.json());
  mount(router, registry);
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return { app, registry };
}

describe('RouteRegistry', () => {
  const { app, registry } = testApp((router, registry) => {
    registry.mount(router, {
      method: 'post',
      path: '/items/{itemId}',
      scope: 'studio',
      permission: 'event.update',
      summary: 'test',
      request: {
        params: z.object({ itemId: z.string().regex(/^[a-f0-9]{24}$/) }),
        query: z.object({ limit: z.coerce.number().int().max(10).default(5) }),
        body: z.object({ name: z.string().min(1) }),
      },
      responses: { 200: { description: 'ok' } },
      handler: (input, _req, res) => {
        res.json(input);
      },
    });
  });

  it('passes parsed, coerced input to the handler', async () => {
    const res = await request(app)
      .post('/items/665f1c2e9b1e8a0012345678?limit=3')
      .send({ name: 'Haldi' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      params: { itemId: '665f1c2e9b1e8a0012345678' },
      query: { limit: 3 },
      body: { name: 'Haldi' },
    });
  });

  it('rejects invalid input with a problem+json listing each field', async () => {
    const res = await request(app).post('/items/not-an-id?limit=99').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(['itemId']);
  });

  it('records scope metadata and OpenAPI paths', () => {
    expect(registry.routes).toEqual([
      { method: 'post', path: '/items/{itemId}', scope: 'studio', permission: 'event.update' },
    ]);
    expect(registry.openapi.definitions).toHaveLength(1);
  });

  it('detects routes mounted without the registry', () => {
    const rogue = express();
    const r = Router();
    r.get('/sneaky', (_req, res) => {
      res.send('x');
    });
    rogue.use('/api', r);
    rogue.get('/also-sneaky', (_req, res) => {
      res.send('x');
    });
    expect(findUnregisteredRoutes(rogue.router.stack)).toEqual(['GET /sneaky', 'GET /also-sneaky']);
    expect(findUnregisteredRoutes(app.router.stack)).toEqual([]);
  });
});

describe('errorHandler', () => {
  const { app } = testApp((router) => {
    router.post('/boom', () => {
      throw new Error('database password is hunter2');
    });
    router.get('/limited', () => {
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests', {
        headers: { 'Retry-After': '30' },
      });
    });
  });

  it('hides internal error details', async () => {
    const res = await request(app).post('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL', title: 'Something went wrong' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('maps malformed JSON and unknown routes to problems', async () => {
    const bad = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    const missing = await request(app).get('/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.type).toBe('https://docs.snapshare.in/errors/not-found');
  });

  it('applies AppError headers', async () => {
    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
  });
});

describe('genRequestId', () => {
  const fakeRes = () => {
    const headers: Record<string, string> = {};
    return { headers, setHeader: (k: string, v: string) => (headers[k] = v) };
  };

  it('reuses a well-formed upstream id and replaces unsafe ones', () => {
    const ok = fakeRes();
    expect(
      genRequestId({ headers: { 'x-request-id': 'abc12345_XYZ' } } as never, ok as never),
    ).toBe('abc12345_XYZ');
    const unsafe = fakeRes();
    const id = genRequestId(
      { headers: { 'x-request-id': 'evil\nlog-injection' } } as never,
      unsafe as never,
    );
    expect(id).toMatch(/^req_[a-f0-9]{32}$/);
    expect(unsafe.headers['X-Request-Id']).toBe(id);
  });
});

describe('loadApiEnv', () => {
  it('names every missing or invalid variable', () => {
    expect(() => loadApiEnv({ CURSOR_SECRET: 'short' })).toThrow(
      /MONGO_URL[\s\S]*REDIS_URL[\s\S]*QDRANT_URL[\s\S]*QDRANT_API_KEY[\s\S]*CORS_ORIGINS[\s\S]*CURSOR_SECRET/,
    );
  });
});
