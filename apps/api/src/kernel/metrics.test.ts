import type { AddressInfo } from 'node:net';
import express, { Router } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { ApiMetrics } from './metrics.js';

describe('ApiMetrics', () => {
  const metrics = new ApiMetrics({ defaultMetrics: false });
  const app = express();
  app.use(metrics.middleware());
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  const v1 = Router();
  v1.get('/events/:eventId', (_req, res) => {
    res.status(403).end();
  });
  app.use('/api/v1', v1);
  const server = metrics.listen(0, '127.0.0.1');
  afterAll(() => {
    server.close();
  });

  it('labels requests by route template and skips probes', async () => {
    await request(app).get('/api/v1/events/665f1c2ab3d4e5f6a7b8c9d1');
    await request(app).get('/api/v1/events/665f1c2ab3d4e5f6a7b8c9d2');
    await request(app).get('/nope/12345');
    await request(app).get('/health');

    const text = await metrics.registry.metrics();
    expect(text).toContain(
      'http_requests_total{method="GET",route="/api/v1/events/:eventId",status="403"} 2',
    );
    expect(text).toContain('route="unmatched"');
    expect(text).not.toContain('665f1c2ab3d4e5f6a7b8c9d1');
    expect(text).not.toContain('12345');
    expect(text).not.toContain('route="/health"');
  });

  it('serves only GET /metrics on its own port', async () => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ok = await fetch(`${base}/metrics`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('http_request_duration_seconds_bucket');
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(404);
  });
});
