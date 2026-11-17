import { createServer, type Server } from 'node:http';
import type { RequestHandler } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

/**
 * RED metrics (rate, errors, duration) for the starter Grafana dashboard
 * (infrastructure/monitoring). Labels use the route template, never the raw URL,
 * so ids in paths cannot explode cardinality or leak into metrics.
 */
export class ApiMetrics {
  readonly registry = new Registry();
  readonly requests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });
  readonly duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  constructor(opts: { defaultMetrics?: boolean } = {}) {
    if (opts.defaultMetrics ?? true) collectDefaultMetrics({ register: this.registry });
  }

  middleware(): RequestHandler {
    return (req, res, next) => {
      if (req.path === '/health' || req.path === '/ready') return next();
      const stop = this.duration.startTimer();
      res.on('finish', () => {
        // req.route is set only when a route matched; baseUrl holds the mount prefix.
        const route = req.route ? `${req.baseUrl}${String(req.route.path)}` : 'unmatched';
        stop({ method: req.method, route });
        this.requests.inc({ method: req.method, route, status: String(res.statusCode) });
      });
      next();
    };
  }

  /**
   * Metrics are served on a separate internal port, never on the public API port,
   * so the edge proxy cannot expose them by accident.
   */
  listen(port: number, host = '0.0.0.0'): Server {
    const server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== '/metrics') {
        res.writeHead(404).end();
        return;
      }
      this.registry.metrics().then(
        (body) => res.writeHead(200, { 'content-type': this.registry.contentType }).end(body),
        () => res.writeHead(500).end(),
      );
    });
    return server.listen(port, host);
  }
}
