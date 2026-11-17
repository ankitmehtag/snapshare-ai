import cookieParser from 'cookie-parser';
import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadApiEnv, TURNSTILE_TEST_SECRET } from '../env.js';
import { hashIp, parseUserAgent } from './client-info.js';
import { csrfProtection } from './csrf.js';
import { errorHandler } from './errors.js';

const ORIGIN = 'https://app.snapshare.in';

function app() {
  const a = express();
  a.use(cookieParser());
  a.use(csrfProtection([ORIGIN]));
  a.all('/x', (_req, res) => {
    res.json({ ok: true });
  });
  a.use(errorHandler(pino({ level: 'silent' })));
  return a;
}

describe('csrfProtection', () => {
  it('lets safe methods through untouched', async () => {
    expect((await request(app()).get('/x')).status).toBe(200);
  });

  it.each([
    ['no origin or referer', {}],
    ['foreign origin', { Origin: 'https://evil.example', 'X-CSRF-Token': 't', Cookie: 'csrf=t' }],
    ['missing header', { Origin: ORIGIN, Cookie: 'csrf=t' }],
    ['missing cookie', { Origin: ORIGIN, 'X-CSRF-Token': 't' }],
    ['mismatch', { Origin: ORIGIN, 'X-CSRF-Token': 'a', Cookie: 'csrf=b' }],
  ])('rejects a POST with %s', async (_label, headers) => {
    const res = await request(app()).post('/x').set(headers);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_FAILED');
  });

  it('accepts a matching token from an allowed origin (or its referer)', async () => {
    const ok = await request(app())
      .post('/x')
      .set({ Origin: ORIGIN, 'X-CSRF-Token': 'tok', Cookie: 'csrf=tok' });
    expect(ok.status).toBe(200);
    const viaReferer = await request(app())
      .delete('/x')
      .set({ Referer: `${ORIGIN}/account`, 'X-CSRF-Token': 'tok', Cookie: 'csrf=tok' });
    expect(viaReferer.status).toBe(200);
  });
});

describe('client info', () => {
  it('labels common browsers and systems coarsely', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS' });
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Android' });
    expect(
      parseUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Edg/140.0'),
    ).toEqual({ browser: 'Edge', os: 'Windows' });
    expect(parseUserAgent(undefined)).toEqual({ browser: 'Unknown', os: 'Unknown' });
  });

  it('never stores the raw IP and is stable per secret', () => {
    const a = hashIp('203.0.113.7', 'secret-one');
    expect(a).not.toContain('203');
    expect(hashIp('203.0.113.7', 'secret-one')).toBe(a);
    expect(hashIp('203.0.113.7', 'secret-two')).not.toBe(a);
  });
});

describe('API env auth rules', () => {
  const base = {
    MONGO_URL: 'mongodb://m/db',
    REDIS_URL: 'redis://r',
    QDRANT_URL: 'http://q:6333',
    QDRANT_API_KEY: 'k'.repeat(16),
    CORS_ORIGINS: ORIGIN,
    CURSOR_SECRET: 'c'.repeat(32),
    APP_URL: ORIGIN,
    IP_HASH_SECRET: 'i'.repeat(32),
  };

  it('allows an ephemeral key and the Turnstile test secret outside production', () => {
    const env = loadApiEnv({ ...base, NODE_ENV: 'development' });
    expect(env.TURNSTILE_SECRET_KEY).toBe(TURNSTILE_TEST_SECRET);
    expect(env.AUTH_JWT_PRIVATE_KEY).toBeUndefined();
  });

  it('refuses to start production without a signing key, with test captcha or insecure cookies', () => {
    expect(() => loadApiEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /AUTH_JWT_PRIVATE_KEY[\s\S]*TURNSTILE_SECRET_KEY[\s\S]*COOKIE_SECURE/,
    );
  });
});
