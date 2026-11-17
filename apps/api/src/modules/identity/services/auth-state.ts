import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { ACCESS_TTL_SECONDS } from './access-tokens.js';

/** Failures within this window count towards captcha and lockout. */
export const FAILURE_WINDOW_SECONDS = 15 * 60;
/** Turnstile is required from this many recent failures (SECURITY §3.1). */
export const CAPTCHA_AFTER_FAILURES = 2;
/** Lock for the rest of the window after this many failures (API_SPEC §1.6). */
export const LOCK_AFTER_FAILURES = 10;

const emailKey = (email: string) =>
  `auth:fail:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
const revokedKey = (sessionId: string) => `auth:rev:${sessionId}`;

export interface LoginGate {
  failures: number;
  captchaRequired: boolean;
  lockedForSeconds: number;
}

/**
 * Login failure counters live in Redis, keyed by a hash of the submitted email —
 * whether or not an account exists. That keeps captcha and lockout behaviour
 * identical for real and unknown emails (no enumeration), and survives API restarts.
 */
export class AuthState {
  constructor(private readonly redis: Redis) {}

  async loginGate(email: string): Promise<LoginGate> {
    const key = emailKey(email);
    const [count, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
    const failures = Number(count ?? 0);
    return {
      failures,
      captchaRequired: failures >= CAPTCHA_AFTER_FAILURES,
      lockedForSeconds: failures >= LOCK_AFTER_FAILURES ? Math.max(ttl, 1) : 0,
    };
  }

  async recordFailure(email: string): Promise<number> {
    const key = emailKey(email);
    const [[, count]] = (await this.redis
      .multi()
      .incr(key)
      .expire(key, FAILURE_WINDOW_SECONDS, 'NX')
      .exec()) as [[null, number], [null, number]];
    return count;
  }

  async clearFailures(email: string): Promise<void> {
    await this.redis.del(emailKey(email));
  }

  /**
   * Marks sessions revoked for as long as an access token issued to them can live,
   * so revocation takes effect on the very next request (TESTING §3).
   */
  async markRevoked(sessionIds: string[]): Promise<void> {
    if (!sessionIds.length) return;
    const multi = this.redis.multi();
    for (const id of sessionIds) multi.set(revokedKey(id), '1', 'EX', ACCESS_TTL_SECONDS + 60);
    await multi.exec();
  }

  async isMarkedRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(revokedKey(sessionId))) === 1;
  }
}
