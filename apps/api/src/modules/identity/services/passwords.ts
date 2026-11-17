import { createHash } from 'node:crypto';
import { hash, verify, type Options } from '@node-rs/argon2';
import type { Logger } from '@snapshare/server-kit';

/**
 * argon2id, m = 64 MiB, t = 3, p = 1 (SECURITY §3.1). Parameters are encoded in each
 * hash, so raising them later only affects new hashes.
 * `algorithm: 2` is Argon2id (the package's const enum can't be imported under
 * isolatedModules).
 */
const PARAMS: Options = { algorithm: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. With no stored hash (unknown email, OAuth-only account) it
 * still runs one full argon2 verification, so response time doesn't reveal whether
 * the account exists (SECURITY §3.1: uniform timing).
 */
export async function verifyPassword(stored: string | undefined, password: string) {
  if (!stored) {
    dummyHash ??= hashPassword('snapshare-timing-equaliser');
    await verify(await dummyHash, password);
    return false;
  }
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

export interface BreachChecker {
  /** True when the password appears in known breaches. */
  isBreached(password: string): Promise<boolean>;
}

/**
 * Have I Been Pwned range API (k-anonymity): only the first 5 hex chars of the
 * SHA-1 leave the server. Free, no key. Fails open (logged) so an HIBP outage
 * never blocks signups; length rules still apply.
 */
export function hibpChecker(logger: Logger, fetchImpl: typeof fetch = fetch): BreachChecker {
  return {
    async isBreached(password) {
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      try {
        const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'snapshare-api' },
          signal: AbortSignal.timeout(2_000),
        });
        if (!res.ok) throw new Error(`HIBP ${res.status}`);
        const body = await res.text();
        return body.split('\n').some((line) => {
          const [hashSuffix, count] = line.trim().split(':');
          return hashSuffix === suffix && Number(count) > 0;
        });
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'breached-password check unavailable');
        return false;
      }
    },
  };
}

export const noBreachCheck: BreachChecker = { isBreached: async () => false };
