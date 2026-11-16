import { createServer } from 'node:http';
import { EnvValidationError } from '@snapshare/config';
import { connectMongo, createLogger, createRedis } from '@snapshare/server-kit';
import { createApp } from './app.js';
import { loadApiEnv } from './env.js';
import { createSocketServer } from './socket.js';

async function main() {
  let env;
  try {
    env = loadApiEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(`[api] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({ service: 'api', level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
  const mongoose = await connectMongo(env.MONGO_URL);
  const redis = createRedis(env.REDIS_URL);

  const { app } = createApp({
    env,
    logger,
    redis,
    readinessChecks: {
      mongo: async () => {
        await mongoose.connection.db!.admin().ping();
      },
      redis: async () => {
        await redis.ping();
      },
      qdrant: async () => {
        const res = await fetch(new URL('/readyz', env.QDRANT_URL), {
          headers: { 'api-key': env.QDRANT_API_KEY },
        });
        if (!res.ok) throw new Error(`qdrant ${res.status}`);
      },
    },
  });

  const http = createServer(app);
  const io = createSocketServer(http, { redis, corsOrigins: env.CORS_ORIGINS, logger });
  http.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await mongoose.disconnect();
    redis.disconnect();
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[api] fatal startup error', err);
  process.exit(1);
});
