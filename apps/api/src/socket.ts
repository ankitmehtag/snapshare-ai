import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Logger } from '@snapshare/server-kit';
import { Server } from 'socket.io';

/**
 * Socket.IO with the Redis adapter so any API replica can emit to any room
 * (ARCHITECTURE §6.7). Authentication arrives in Phase 2; until then every
 * connection is rejected rather than accepted unauthenticated.
 */
export function createSocketServer(
  http: HttpServer,
  deps: { redis: Redis; corsOrigins: readonly string[]; logger: Logger },
): Server {
  const io = new Server(http, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: [...deps.corsOrigins], credentials: true },
  });
  const pub = deps.redis.duplicate();
  const sub = deps.redis.duplicate();
  io.adapter(createAdapter(pub, sub));
  io.use((_socket, next) => next(new Error('UNAUTHENTICATED')));
  io.engine.on('connection_error', (err: { message: string }) =>
    deps.logger.debug({ err: err.message }, 'socket connection rejected'),
  );
  const close = io.close.bind(io);
  // Disconnect the adapter's Redis clients only after Socket.IO has unsubscribed.
  io.close = (fn) =>
    close((err) => {
      void Promise.allSettled([pub.quit(), sub.quit()]).then(() => fn?.(err));
    });
  return io;
}
