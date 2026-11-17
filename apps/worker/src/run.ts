import { createServer, type Server } from 'node:http';
import type { QueueName } from '@snapshare/config';
import { OutboxRelay, createQueue, createWorker, type Logger } from '@snapshare/server-kit';
import type { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Mailer } from './email/mailer.js';
import { PROCESSORS } from './processors/index.js';
import { ROLES, type Role } from './roles.js';

export interface RunDeps {
  roles: Role[];
  redis: Redis;
  logger: Logger;
  nodeEnv: 'development' | 'test' | 'production';
  readinessChecks: Record<string, () => Promise<void>>;
  healthPort?: number;
  mailer?: Mailer;
}

export interface Running {
  workers: Worker[];
  relay?: OutboxRelay;
  idleQueues: QueueName[];
  stop: () => Promise<void>;
}

export async function startWorkers(deps: RunDeps): Promise<Running> {
  const workers: Worker[] = [];
  const closables: { close: () => Promise<void> }[] = [];
  const idleQueues: QueueName[] = [];
  let relay: OutboxRelay | undefined;

  if (deps.roles.includes('relay')) {
    const producers = new Map<QueueName, Queue>();
    relay = new OutboxRelay({
      logger: deps.logger.child({ role: 'relay' }),
      queueFor: (topic) => {
        let q = producers.get(topic);
        if (!q) {
          q = createQueue(topic, deps.redis);
          producers.set(topic, q);
          closables.push(q);
        }
        return q;
      },
    });
    relay.start();
  }

  for (const role of deps.roles) {
    for (const name of ROLES[role] as readonly QueueName[]) {
      const factory = PROCESSORS[name];
      const testOnlyInProd = name === 'system.ping' && deps.nodeEnv === 'production';
      if (!factory || testOnlyInProd) {
        if (!testOnlyInProd) idleQueues.push(name);
        continue;
      }
      const { worker, deadLetters } = createWorker(
        name,
        factory({ logger: deps.logger, ...(deps.mailer ? { mailer: deps.mailer } : {}) }),
        {
          connection: deps.redis,
          logger: deps.logger,
          nodeEnv: deps.nodeEnv,
        },
      );
      workers.push(worker);
      closables.push(deadLetters);
    }
  }
  if (idleQueues.length) {
    deps.logger.info({ idleQueues }, 'queues without a processor yet; their jobs wait in Redis');
  }

  let health: Server | undefined;
  if (deps.healthPort !== undefined) health = startHealthServer(deps);

  return {
    workers,
    relay,
    idleQueues,
    stop: async () => {
      await relay?.stop();
      // Finish in-flight jobs, then close producers and DLQ handles.
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(closables.map((c) => c.close()));
      await new Promise<void>((r) => (health ? health.close(() => r()) : r()));
    },
  };
}

function startHealthServer(deps: RunDeps): Server {
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    if (req.url === '/ready') {
      const names = Object.keys(deps.readinessChecks);
      const results = await Promise.allSettled(names.map((n) => deps.readinessChecks[n]!()));
      const checks = Object.fromEntries(
        names.map((n, i) => [n, results[i]!.status === 'fulfilled' ? 'ok' : 'fail']),
      );
      const ready = results.every((r) => r.status === 'fulfilled');
      res
        .writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', checks }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(deps.healthPort);
  return server;
}
