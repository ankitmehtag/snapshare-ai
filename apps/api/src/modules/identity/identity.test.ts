import { createPublicKey } from 'node:crypto';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { TokenExpiredError } from '../../kernel/auth.js';
import { createAccessTokens, keysFromEnv, newKeyPairPem } from './services/access-tokens.js';
import { hibpChecker } from './services/passwords.js';

const claims = {
  userId: '665f1c2e9b1e8a0012345678',
  sessionId: '665f1c2e9b1e8a0012345679',
  platformRole: 'none' as const,
};

describe('access tokens', () => {
  it('round-trips claims and rejects tampering', async () => {
    const tokens = await createAccessTokens({ kid: 'k1' });
    const jwt = await tokens.sign(claims);
    expect(await tokens.verify(jwt)).toEqual(claims);
    const [h, p, s] = jwt.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), prole: 'admin' }),
    ).toString('base64url');
    expect(await tokens.verify(`${h}.${forgedPayload}.${s}`)).toBeNull();
    expect(await tokens.verify('not.a.jwt')).toBeNull();
  });

  it('keeps accepting tokens from a rotated-out key listed as previous', async () => {
    const oldPair = await newKeyPairPem();
    const newPair = await newKeyPairPem();
    const before = await createAccessTokens({ kid: 'k1', privateKeyPem: oldPair.privatePem });
    const jwt = await before.sign(claims);

    const rotated = await createAccessTokens({
      kid: 'k2',
      privateKeyPem: newPair.privatePem,
      previous: { k1: oldPair.publicPem },
    });
    expect(await rotated.verify(jwt)).toEqual(claims);

    const dropped = await createAccessTokens({ kid: 'k2', privateKeyPem: newPair.privatePem });
    expect(await dropped.verify(jwt)).toBeNull();
  });

  it('signals expiry distinctly so the client knows to refresh', async () => {
    const tokens = await createAccessTokens({ kid: 'k1' });
    const jwt = await tokens.sign(claims);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await expect(tokens.verify(jwt)).rejects.toBeInstanceOf(TokenExpiredError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads base64 keys from env and derives the matching public key', async () => {
    const pair = await newKeyPairPem();
    const keys = keysFromEnv({
      AUTH_JWT_PRIVATE_KEY: Buffer.from(pair.privatePem).toString('base64'),
      AUTH_JWT_KEY_ID: 'prod1',
      AUTH_JWT_PREVIOUS_KEYS: Buffer.from(JSON.stringify({ old: pair.publicPem })).toString(
        'base64',
      ),
    });
    expect(keys.privateKeyPem).toBe(pair.privatePem);
    expect(keys.previous?.old).toBe(pair.publicPem);
    expect(createPublicKey(pair.publicPem).asymmetricKeyType).toBe('ed25519');
    const tokens = await createAccessTokens(keys);
    expect(await tokens.verify(await tokens.sign(claims))).toEqual(claims);
  });
});

describe('breached-password check (HIBP k-anonymity)', () => {
  const logger = pino({ level: 'silent' });
  // SHA-1("password123456") = 4DEC8...; the range API returns suffixes for the prefix.
  const fakeFetch = (body: string, ok = true) =>
    (async (url: string | URL | Request) => {
      expect(String(url)).toMatch(/\/range\/[0-9A-F]{5}$/);
      return new Response(body, { status: ok ? 200 : 503 });
    }) as typeof fetch;

  it('sends only the 5-char prefix and matches the suffix', async () => {
    const sha1 = (await import('node:crypto'))
      .createHash('sha1')
      .update('password123456')
      .digest('hex')
      .toUpperCase();
    const checker = hibpChecker(logger, fakeFetch(`${sha1.slice(5)}:4242\r\nABCDEF:0`));
    expect(await checker.isBreached('password123456')).toBe(true);
    expect(await checker.isBreached('a genuinely unusual passphrase')).toBe(false);
  });

  it('ignores padding entries (count 0) and fails open on errors', async () => {
    const sha1 = (await import('node:crypto'))
      .createHash('sha1')
      .update('x'.repeat(12))
      .digest('hex')
      .toUpperCase();
    expect(
      await hibpChecker(logger, fakeFetch(`${sha1.slice(5)}:0`)).isBreached('x'.repeat(12)),
    ).toBe(false);
    expect(await hibpChecker(logger, fakeFetch('', false)).isBreached('whatever pass')).toBe(false);
  });
});
