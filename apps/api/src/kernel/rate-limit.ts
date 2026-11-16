import type { Redis } from 'ioredis';
import type { Request, RequestHandler } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from './errors.js';

export interface RateLimitOptions {
  /** Unique name of the limit class (API_SPEC §1.6), e.g. "auth.login". */
  name: string;
  points: number;
  durationSeconds: number;
  key?: (req: Request) => string;
  /**
   * Behaviour when Redis is unavailable. Security-sensitive limits (login, OTP, PIN)
   * must fail closed; general traffic limits fail open so an outage is not total.
   */
  failOpen: boolean;
}

export function rateLimit(redis: Redis, opts: RateLimitOptions): RequestHandler {
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${opts.name}`,
    points: opts.points,
    duration: opts.durationSeconds,
  });
  const keyOf = opts.key ?? ((req: Request) => req.ip ?? 'unknown');

  return async (req, res, next) => {
    try {
      const r = await limiter.consume(keyOf(req));
      res.setHeader('RateLimit-Remaining', String(r.remainingPoints));
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = String(Math.max(1, Math.ceil(err.msBeforeNext / 1000)));
        return next(
          new AppError(429, 'RATE_LIMITED', 'Too many requests', {
            headers: { 'Retry-After': retryAfter },
          }),
        );
      }
      req.log?.warn({ err, limit: opts.name }, 'rate limiter unavailable');
      if (opts.failOpen) return next();
      return next(new AppError(429, 'RATE_LIMITED', 'Please try again shortly'));
    }
  };
}
