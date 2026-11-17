import { EnvValidationError } from '@snapshare/config';
import { connectMongo, createLogger, createRedis } from '@snapshare/server-kit';
import { smtpMailer } from './email/mailer.js';
import { loadWorkerEnv } from './env.js';
import { parseRoles } from './roles.js';
import { startWorkers } from './run.js';

async function main() {
  let env;
  let roles;
  try {
    env = loadWorkerEnv();
    roles = parseRoles(process.argv[2]);
  } catch (err) {
    console.error(`[worker] ${err instanceof EnvValidationError ? err.message : String(err)}`);
    process.exit(1);
  }

  const logger = createLogger({
    service: `worker-${process.argv[2]}`,
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY,
  });
  const mongoose = await connectMongo(env.MONGO_URL);
  const redis = createRedis(env.REDIS_URL, { forQueues: true });

  const mailer = roles.includes('notify')
    ? smtpMailer({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.MAIL_FROM,
      })
    : undefined;

  const running = await startWorkers({
    roles,
    ...(mailer ? { mailer } : {}),
    redis,
    logger,
    nodeEnv: env.NODE_ENV,
    healthPort: env.WORKER_HEALTH_PORT,
    readinessChecks: {
      mongo: async () => {
        await mongoose.connection.db!.admin().ping();
      },
      redis: async () => {
        await redis.ping();
      },
    },
  });
  logger.info({ roles, workers: running.workers.length }, 'worker started');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'draining workers');
    const force = setTimeout(() => process.exit(1), 60_000).unref();
    await running.stop();
    mailer?.close();
    await mongoose.disconnect();
    redis.disconnect();
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[worker] fatal startup error', err);
  process.exit(1);
});
