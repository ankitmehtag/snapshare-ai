/**
 * Auth suite (TESTING §3): lockout, refresh rotation + reuse detection, revocation
 * within the access-token TTL, CSRF rejection, enumeration-safe responses.
 * Runs against the real MongoDB replica set and Valkey (`pnpm infra:up`).
 */
import { randomBytes } from 'node:crypto';
import { connectMongo, createRedis, OutboxModel } from '@snapshare/server-kit';
import { SignJWT, importPKCS8 } from 'jose';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { applyMigrations, TEST_MONGO_BASE, TEST_REDIS_URL } from '../../testing.js';
import { AuditLogModel } from '../audit/models/audit-log.model.js';
import { RefreshTokenModel } from './models/refresh-token.model.js';
import { SessionModel } from './models/session.model.js';
import { UserModel } from './models/user.model.js';
import { createIdentityModule, type BreachChecker, type CaptchaVerifier } from './index.js';
import { newKeyPairPem } from './services/access-tokens.js';
import { AuthState, LOCK_AFTER_FAILURES } from './services/auth-state.js';

const ORIGIN = 'http://localhost:5173';
const logger = pino({ level: 'silent' });
const redis = createRedis(TEST_REDIS_URL);
const dbName = `auth_test_${randomBytes(3).toString('hex')}`;
const PASSWORD = 'correct horse battery';
const BREACHED = 'password123456';

const captcha: CaptchaVerifier = { verify: async (token) => token === 'captcha-ok' };
const breach: BreachChecker = { isBreached: async (p) => p === BREACHED };

let app: ReturnType<typeof createApp>['app'];
let keyPem: string;

beforeAll(async () => {
  await connectMongo(`${TEST_MONGO_BASE}/${dbName}?directConnection=true`);
  await applyMigrations(mongoose.connection.db as unknown as Db);
  await OutboxModel.createCollection();
  await redis.flushdb();
  keyPem = (await newKeyPairPem()).privatePem;
  const identity = await createIdentityModule({
    redis,
    logger,
    keys: { kid: 'test', privateKeyPem: keyPem },
    captcha,
    breach,
    appUrl: ORIGIN,
    cookies: { secure: false },
    ipHashSecret: 'test-ip-hash-secret-0123456789abcdef',
  });
  ({ app } = createApp({
    // One trusted proxy hop lets each test client use its own X-Forwarded-For IP,
    // so per-IP rate limits don't leak between tests.
    env: { NODE_ENV: 'test', CORS_ORIGINS: [ORIGIN], TRUST_PROXY: 1 },
    logger,
    redis,
    readinessChecks: {},
    modules: [identity.mount],
  }));
});

beforeEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  redis.disconnect();
});

// --- helpers -------------------------------------------------------------------------

let ipCounter = 0;

/** A browser: own cookie jar, own IP, CSRF token fetched like the web app does. */
async function browser() {
  const agent = request.agent(app);
  const ip = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
  const csrfRes = await agent.get('/api/v1/auth/csrf').set('X-Forwarded-For', ip);
  const csrf = csrfRes.body.csrfToken as string;
  const send = (method: 'post' | 'patch' | 'delete', path: string, body?: object) => {
    const r = agent[method](`/api/v1${path}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .set('X-Forwarded-For', ip);
    return body ? r.send(body) : r;
  };
  return {
    agent,
    ip,
    get: (path: string) => agent.get(`/api/v1${path}`).set('X-Forwarded-For', ip),
    post: (path: string, body?: object) => send('post', path, body),
    patch: (path: string, body?: object) => send('patch', path, body),
    del: (path: string) => send('delete', path),
  };
}

const uniqueEmail = () => `user_${randomBytes(4).toString('hex')}@example.com`;

/** Latest email of a template sent to an address (read from the outbox). */
async function lastEmail(to: string, template: string) {
  const entry = await OutboxModel.findOne({
    topic: 'notify.email',
    'payload.to': to,
    'payload.template': template,
  })
    .sort({ _id: -1 })
    .lean();
  return entry?.payload as { data: Record<string, string> } | undefined;
}

const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!;

async function signup(b: Awaited<ReturnType<typeof browser>>, email = uniqueEmail()) {
  const res = await b.post('/auth/signup', {
    name: 'Asha Rao',
    email,
    password: PASSWORD,
    turnstileToken: 'captcha-ok',
  });
  expect(res.status).toBe(202);
  return email;
}

async function signedIn(email?: string) {
  const b = await browser();
  const address = await signup(b, email);
  const login = await b.post('/auth/login', { email: address, password: PASSWORD });
  expect(login.status).toBe(204);
  return { b, email: address };
}

const stripId = (body: Record<string, unknown>) => {
  const { requestId: _ignored, ...rest } = body;
  return rest;
};

// --- signup & verification -----------------------------------------------------------

describe('signup and email verification', () => {
  it('creates an unverified user and queues a verification email in the same transaction', async () => {
    const b = await browser();
    const email = await signup(b);
    const user = await UserModel.findOne({ email }).lean();
    expect(user?.emailVerifiedAt).toBeUndefined();
    expect(user?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    const mail = await lastEmail(email, 'verify_email');
    expect(mail?.data.url).toMatch(`${ORIGIN}/verify?token=`);
  });

  it('answers a duplicate signup exactly like a new one and emails the real owner', async () => {
    const b = await browser();
    const email = await signup(b);
    const again = await b.post('/auth/signup', {
      name: 'Someone Else',
      email,
      password: 'another long password',
      turnstileToken: 'captcha-ok',
    });
    expect(again.status).toBe(202);
    expect(again.body).toEqual({ status: 'check_email' });
    expect(await UserModel.countDocuments({ email })).toBe(1);
    expect(await lastEmail(email, 'account_exists')).toBeDefined();
  });

  it('rejects breached passwords and missing captcha', async () => {
    const b = await browser();
    const breached = await b.post('/auth/signup', {
      name: 'A',
      email: uniqueEmail(),
      password: BREACHED,
      turnstileToken: 'captcha-ok',
    });
    expect(breached.status).toBe(400);
    expect(breached.body.errors[0].path).toBe('password');

    const bot = await b.post('/auth/signup', {
      name: 'A',
      email: uniqueEmail(),
      password: PASSWORD,
      turnstileToken: 'nope',
    });
    expect(bot.status).toBe(403);
    expect(bot.body.code).toBe('CAPTCHA_REQUIRED');
  });

  it('verifies once, then reports already_verified; bad links are TOKEN_INVALID', async () => {
    const b = await browser();
    const email = await signup(b);
    const token = tokenFrom((await lastEmail(email, 'verify_email'))!.data.url!);

    const first = await b.post('/auth/verify-email', { token });
    expect(first.body).toEqual({ status: 'verified' });
    const second = await b.post('/auth/verify-email', { token });
    expect(second.body).toEqual({ status: 'already_verified' });

    const bad = await b.post('/auth/verify-email', { token: 'x'.repeat(43) });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'TOKEN_INVALID', meta: { reason: 'invalid' } });
  });
});

// --- login ---------------------------------------------------------------------------

describe('login', () => {
  it('sets HttpOnly session cookies scoped as specified and serves /me', async () => {
    const b = await browser();
    const email = await signup(b);
    const res = await b.post('/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(204);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const at = setCookie.find((c) => c.startsWith('at='))!;
    const rt = setCookie.find((c) => c.startsWith('rt='))!;
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/SameSite=Lax/);
    expect(at).toMatch(/Path=\//);
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);

    const me = await b.get('/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, emailVerified: false, workspaces: [] });
    expect(JSON.stringify(me.body)).not.toMatch(/argon2|passwordHash/);
  });

  it('gives identical responses for a wrong password and an unknown email', async () => {
    const b = await browser();
    const email = await signup(b);
    const wrong = await b.post('/auth/login', { email, password: 'not the password' });
    const unknown = await b.post('/auth/login', { email: uniqueEmail(), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(stripId(wrong.body)).toEqual(stripId(unknown.body));
  });

  it('requires the captcha after 2 failures, for real and unknown emails alike', async () => {
    const b = await browser();
    const email = await signup(b);
    for (const address of [email, uniqueEmail()]) {
      await b.post('/auth/login', { email: address, password: 'wrong one' });
      await b.post('/auth/login', { email: address, password: 'wrong two' });
      const third = await b.post('/auth/login', { email: address, password: PASSWORD });
      expect(third.status).toBe(403);
      expect(third.body.code).toBe('CAPTCHA_REQUIRED');
    }
    const solved = await b.post('/auth/login', {
      email,
      password: PASSWORD,
      turnstileToken: 'captcha-ok',
    });
    expect(solved.status).toBe(204);
  });

  it('locks an email after 10 failures with Retry-After, real or not', async () => {
    const state = new AuthState(redis);
    const b = await browser();
    const email = await signup(b);
    for (const address of [email, uniqueEmail()]) {
      for (let i = 0; i < LOCK_AFTER_FAILURES; i++) await state.recordFailure(address);
      const res = await b.post('/auth/login', {
        email: address,
        password: PASSWORD,
        turnstileToken: 'captcha-ok',
      });
      expect(res.status).toBe(423);
      expect(res.body.code).toBe('LOCKED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    }
  });

  it('audits successful and failed logins without storing raw IPs', async () => {
    const b = await browser();
    const email = await signup(b);
    await b.post('/auth/login', { email, password: 'wrong' });
    await b.post('/auth/login', { email, password: PASSWORD });
    const user = await UserModel.findOne({ email }).lean();
    const actions = (await AuditLogModel.find({ 'actor.userId': user!._id }).lean()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['auth.signup', 'auth.login_failed', 'auth.login']),
    );
    const raw = JSON.stringify(await AuditLogModel.find({ 'actor.userId': user!._id }).lean());
    expect(raw).not.toContain(b.ip);
  });
});

// --- CSRF ----------------------------------------------------------------------------

describe('CSRF protection', () => {
  it('rejects state-changing requests without the double-submit token or from a foreign origin', async () => {
    const { b } = await signedIn();
    const noToken = await b.agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', b.ip);
    expect(noToken.status).toBe(403);
    expect(noToken.body.code).toBe('CSRF_FAILED');

    const csrf = (await b.get('/auth/csrf')).body.csrfToken as string;
    const evil = await b.agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', csrf)
      .set('X-Forwarded-For', b.ip);
    expect(evil.status).toBe(403);

    const wrong = await b.agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', 'forged-token-value')
      .set('X-Forwarded-For', b.ip);
    expect(wrong.status).toBe(403);
    // Still signed in: none of the forged requests had any effect.
    expect((await b.get('/me')).status).toBe(200);
  });

  it('guards login itself (login CSRF)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: uniqueEmail(), password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_FAILED');
  });
});

// --- refresh rotation ----------------------------------------------------------------

describe('refresh token rotation', () => {
  const rtOf = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
      .find((c) => c.startsWith('rt='))
      ?.split(';')[0]
      ?.slice(3);

  it('rotates on every refresh and keeps one family', async () => {
    const b = await browser();
    const email = await signup(b);
    const login = await b.post('/auth/login', { email, password: PASSWORD });
    const first = rtOf(login)!;
    const refreshed = await b.post('/auth/refresh');
    expect(refreshed.status).toBe(204);
    const second = rtOf(refreshed)!;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    const user = await UserModel.findOne({ email }).lean();
    const tokens = await RefreshTokenModel.find({ userId: user!._id }).lean();
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map((t) => t.familyId)).size).toBe(1);
    expect((await b.get('/me')).status).toBe(200);
  });

  it('tolerates a concurrent tab within the grace window without minting another token', async () => {
    const b = await browser();
    const email = await signup(b);
    const login = await b.post('/auth/login', { email, password: PASSWORD });
    const old = rtOf(login)!;
    await b.post('/auth/refresh');
    // The other tab still holds the old cookie for a moment.
    const lateTab = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`rt=${old}`, 'csrf=c'])
      .set('X-CSRF-Token', 'c')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', b.ip);
    expect(lateTab.status).toBe(204);
    expect(rtOf(lateTab)).toBeUndefined();
  });

  it('treats reuse of a rotated token as theft: the whole session is revoked', async () => {
    const b = await browser();
    const email = await signup(b);
    const login = await b.post('/auth/login', { email, password: PASSWORD });
    const stolen = rtOf(login)!;
    await b.post('/auth/refresh');
    // Move the rotation outside the grace window.
    const user = await UserModel.findOne({ email }).lean();
    await RefreshTokenModel.updateMany(
      { userId: user!._id, usedAt: { $exists: true } },
      { $set: { usedAt: new Date(Date.now() - 60_000) } },
    );

    const attacker = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`rt=${stolen}`, 'csrf=c'])
      .set('X-CSRF-Token', 'c')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '203.0.113.9');
    expect(attacker.status).toBe(401);

    // The legitimate user's session is gone too, immediately.
    expect((await b.get('/me')).status).toBe(401);
    expect((await b.post('/auth/refresh')).status).toBe(401);
    const session = await SessionModel.findOne({ userId: user!._id }).lean();
    expect(session?.revokedAt).toBeInstanceOf(Date);
    expect(await AuditLogModel.countDocuments({ action: 'auth.refresh_reuse' })).toBeGreaterThan(0);
  });

  it('answers TOKEN_EXPIRED for an expired access token so the client can refresh', async () => {
    const { b, email } = await signedIn();
    const user = await UserModel.findOne({ email }).lean();
    const session = await SessionModel.findOne({ userId: user!._id }).lean();
    const key = await importPKCS8(keyPem, 'EdDSA');
    const expired = await new SignJWT({ sid: String(session!._id), prole: 'none' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
      .setSubject(String(user!._id))
      .setIssuer('snapshare-api')
      .setAudience('snapshare-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
      .sign(key);
    const res = await request(app).get('/api/v1/me').set('Cookie', `at=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    expect((await b.post('/auth/refresh')).status).toBe(204);
  });

  it('rejects a token signed by another key', async () => {
    const other = await importPKCS8((await newKeyPairPem()).privatePem, 'EdDSA');
    const forged = await new SignJWT({ sid: '665f1c2e9b1e8a0012345678', prole: 'admin' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
      .setSubject('665f1c2e9b1e8a0012345678')
      .setIssuer('snapshare-api')
      .setAudience('snapshare-web')
      .setExpirationTime('5m')
      .sign(other);
    const res = await request(app).get('/api/v1/me').set('Cookie', `at=${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

// --- sessions & logout ---------------------------------------------------------------

describe('sessions', () => {
  it('revoking another device takes effect on its very next request', async () => {
    const email = uniqueEmail();
    const { b: laptop } = await signedIn(email);
    const phone = await browser();
    expect((await phone.post('/auth/login', { email, password: PASSWORD })).status).toBe(204);

    const list = await laptop.get('/me/sessions');
    expect(list.body.data).toHaveLength(2);
    const other = list.body.data.find((s: { current: boolean }) => !s.current);
    expect((await laptop.del(`/me/sessions/${other.id}`)).status).toBe(204);

    // The phone's access JWT is still unexpired, but the session is dead now.
    expect((await phone.get('/me')).status).toBe(401);
    expect((await laptop.get('/me')).status).toBe(200);
  });

  it("returns 404 for another user's session id and leaves it alone", async () => {
    const { b: alice } = await signedIn();
    const { b: bob } = await signedIn();
    const bobSession = (await bob.get('/me/sessions')).body.data[0].id as string;
    expect((await alice.del(`/me/sessions/${bobSession}`)).status).toBe(404);
    expect((await bob.get('/me')).status).toBe(200);
  });

  it('"sign out everywhere else" keeps only the current device', async () => {
    const email = uniqueEmail();
    const { b: main } = await signedIn(email);
    const others = [await browser(), await browser()];
    for (const o of others) await o.post('/auth/login', { email, password: PASSWORD });
    const res = await main.del('/me/sessions');
    expect(res.body).toEqual({ revoked: 2 });
    for (const o of others) expect((await o.get('/me')).status).toBe(401);
    expect((await main.get('/me')).status).toBe(200);
  });

  it('logout revokes the session and clears cookies', async () => {
    const { b } = await signedIn();
    const res = await b.post('/auth/logout');
    expect(res.status).toBe(204);
    const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cleared).toMatch(/at=;/);
    expect(cleared).toMatch(/rt=;/);
    expect((await b.get('/me')).status).toBe(401);
    expect((await b.post('/auth/refresh')).status).toBe(401);
  });
});

// --- passwords -----------------------------------------------------------------------

describe('password reset and change', () => {
  it('forgot-password answers the same for unknown emails', async () => {
    const b = await browser();
    const email = await signup(b);
    const known = await b.post('/auth/forgot-password', { email, turnstileToken: 'captcha-ok' });
    const unknown = await b.post('/auth/forgot-password', {
      email: uniqueEmail(),
      turnstileToken: 'captcha-ok',
    });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });

  it('reset sets the new password, signs out every device and works once', async () => {
    const email = uniqueEmail();
    const { b: device } = await signedIn(email);
    const b = await browser();
    await b.post('/auth/forgot-password', { email, turnstileToken: 'captcha-ok' });
    const token = tokenFrom((await lastEmail(email, 'password_reset'))!.data.url!);

    const reset = await b.post('/auth/reset-password', {
      token,
      password: 'a brand new passphrase',
    });
    expect(reset.status).toBe(204);
    expect((await device.get('/me')).status).toBe(401);
    expect((await b.post('/auth/login', { email, password: PASSWORD })).status).toBe(401);
    expect(
      (await b.post('/auth/login', { email, password: 'a brand new passphrase' })).status,
    ).toBe(204);
    const reuse = await b.post('/auth/reset-password', {
      token,
      password: 'yet another passphrase',
    });
    expect(reuse.body).toMatchObject({ code: 'TOKEN_INVALID', meta: { reason: 'used' } });
    expect(await lastEmail(email, 'password_changed')).toBeDefined();
  });

  it('change password needs the current one and signs out other devices only', async () => {
    const email = uniqueEmail();
    const { b: main } = await signedIn(email);
    const other = await browser();
    await other.post('/auth/login', { email, password: PASSWORD });

    const wrong = await main.post('/me/password', {
      currentPassword: 'nope',
      newPassword: 'a different passphrase',
    });
    expect(wrong.status).toBe(400);

    const ok = await main.post('/me/password', {
      currentPassword: PASSWORD,
      newPassword: 'a different passphrase',
    });
    expect(ok.status).toBe(204);
    expect((await main.get('/me')).status).toBe(200);
    expect((await other.get('/me')).status).toBe(401);
  });
});

describe('profile', () => {
  it('updates name and language, never email', async () => {
    const { b, email } = await signedIn();
    const res = await b.patch('/me', { name: 'Asha R.', locale: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Asha R.', locale: 'hi', email });
    const sneaky = await b.patch('/me', { email: 'attacker@example.com' } as object);
    expect(sneaky.status).toBe(400);
  });
});
