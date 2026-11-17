import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeOutbox, type Logger } from '@snapshare/server-kit';
import type { EmailJob, EmailTemplate, Me, SessionInfo, Workspace } from '@snapshare/types';
import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../../../kernel/errors.js';
import { inTransaction } from '../../../kernel/transaction.js';
import { recordAudit } from '../../audit/index.js';
import { sessionsRepo } from '../repositories/sessions.repo.js';
import { usersRepo, type UserDoc } from '../repositories/users.repo.js';
import { verificationRepo } from '../repositories/verification.repo.js';
import type { AccessTokens } from './access-tokens.js';
import type { AuthState } from './auth-state.js';
import type { CaptchaVerifier } from './captcha.js';
import { hashPassword, verifyPassword, type BreachChecker } from './passwords.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * DAY_MS;
export const SESSION_ABSOLUTE_MS = 90 * DAY_MS;
const VERIFY_TTL_MS = DAY_MS;
const RESET_TTL_MS = 60 * 60 * 1000;
/** A refresh token re-presented this soon after rotation is a concurrent tab, not theft. */
export const REFRESH_GRACE_MS = 15_000;

export interface ClientMeta {
  ip: string | undefined;
  ipHash: string;
  ua: string;
  browser: string;
  os: string;
  requestId?: string;
}

export interface IssuedSession {
  accessToken: string;
  /** Present when a new refresh token was minted (absent in the rotation grace path). */
  refreshToken?: string;
  sessionExpiresAt: Date;
}

export interface AuthServiceDeps {
  tokens: AccessTokens;
  state: AuthState;
  captcha: CaptchaVerifier;
  breach: BreachChecker;
  appUrl: string;
  logger: Logger;
  workspacesFor?: (userId: string) => Promise<Workspace[]>;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const newOpaqueToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
};

const invalidCredentials = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Email or password is incorrect');
const invalidLink = (reason: 'invalid' | 'expired' | 'used') =>
  new AppError(400, 'TOKEN_INVALID', 'This link is invalid or has expired', { meta: { reason } });

/**
 * Account and session lifecycle (API_SPEC §2.1, SECURITY §3.1). Responses that
 * could reveal whether an email is registered are identical either way.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  // --- signup & verification ------------------------------------------------------

  async signup(
    input: {
      name: string;
      email: string;
      password: string;
      locale: 'en' | 'hi';
      turnstileToken: string;
    },
    client: ClientMeta,
  ): Promise<void> {
    await this.requireCaptcha(input.turnstileToken, client);
    await this.rejectBreached(input.password);
    // Hash before the lookup so both branches cost the same (uniform timing).
    const passwordHash = await hashPassword(input.password);
    const existing = await usersRepo.findByEmail(input.email);

    if (existing) {
      // Tell the real owner, not the requester: "you already have an account".
      await inTransaction((s) =>
        this.email(s, 'account_exists', existing.email, existing.locale, {
          name: existing.name,
          loginUrl: `${this.deps.appUrl}/login`,
          resetUrl: `${this.deps.appUrl}/forgot`,
        }),
      );
      return;
    }

    try {
      await inTransaction(async (s) => {
        const user = await usersRepo.create(
          { email: input.email, name: input.name, passwordHash, locale: input.locale },
          s,
        );
        await this.sendVerification(s, user);
        await recordAudit(
          { action: 'auth.signup', actorUserId: String(user._id), ...this.auditClient(client) },
          s,
        );
      });
    } catch (err) {
      // Lost a race with a concurrent signup for the same email: same response.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  async verifyEmail(token: string): Promise<'verified' | 'already_verified'> {
    const doc = await verificationRepo.find('email_verify', sha256(token));
    if (!doc?.subject.userId) throw invalidLink('invalid');
    if (doc.expiresAt <= new Date()) throw invalidLink('expired');
    const user = await usersRepo.findById(doc.subject.userId);
    if (!user) throw invalidLink('invalid');
    if (user.emailVerifiedAt) return 'already_verified';
    if (doc.consumedAt) throw invalidLink('used');

    return inTransaction(async (s) => {
      if (!(await verificationRepo.consume(doc._id, s))) throw invalidLink('used');
      const changed = await usersRepo.markEmailVerified(user._id, s);
      if (changed) {
        await recordAudit({ action: 'auth.email_verified', actorUserId: String(user._id) }, s);
      }
      return changed ? 'verified' : 'already_verified';
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await usersRepo.findByEmail(email);
    if (!user || user.emailVerifiedAt || user.status !== 'active') return;
    await inTransaction((s) => this.sendVerification(s, user));
  }

  // --- login, refresh, logout --------------------------------------------------------

  async login(
    input: { email: string; password: string; turnstileToken?: string | undefined },
    client: ClientMeta,
  ): Promise<IssuedSession> {
    const gate = await this.deps.state.loginGate(input.email);
    if (gate.lockedForSeconds > 0) {
      throw new AppError(423, 'LOCKED', 'Too many attempts. Try again later.', {
        headers: { 'Retry-After': String(gate.lockedForSeconds) },
        meta: { retryAfterSeconds: gate.lockedForSeconds },
      });
    }
    if (
      gate.captchaRequired &&
      !(await this.deps.captcha.verify(input.turnstileToken, client.ip))
    ) {
      throw new AppError(403, 'CAPTCHA_REQUIRED', 'Please complete the security check');
    }

    const user = await usersRepo.findByEmail(input.email);
    const ok = await verifyPassword(user?.passwordHash, input.password);
    if (!user || !ok) {
      const failures = await this.deps.state.recordFailure(input.email);
      if (user) {
        await recordAudit({
          action: 'auth.login_failed',
          actorUserId: String(user._id),
          meta: { failures },
          ...this.auditClient(client),
        });
      }
      throw invalidCredentials();
    }
    if (user.status !== 'active') {
      // Only reachable with the correct password, so this reveals nothing new.
      throw new AppError(403, 'FORBIDDEN', 'This account is not active', {
        detail: 'Contact support if you think this is a mistake.',
      });
    }

    await this.deps.state.clearFailures(input.email);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
    return inTransaction(async (s) => {
      const session = await sessionsRepo.create(
        {
          userId: user._id,
          device: { ua: client.ua, browser: client.browser, os: client.os, ipHash: client.ipHash },
          expiresAt,
        },
        s,
      );
      const refresh = newOpaqueToken();
      await sessionsRepo.createRefreshToken(
        {
          sessionId: session._id,
          userId: user._id,
          tokenHash: refresh.hash,
          familyId: randomUUID(),
          expiresAt,
        },
        s,
      );
      await recordAudit(
        {
          action: 'auth.login',
          actorUserId: String(user._id),
          target: { type: 'session', id: String(session._id) },
          ...this.auditClient(client),
        },
        s,
      );
      return {
        accessToken: await this.accessFor(user, session._id),
        refreshToken: refresh.token,
        sessionExpiresAt: expiresAt,
      };
    });
  }

  async refresh(refreshToken: string | undefined, client: ClientMeta): Promise<IssuedSession> {
    if (!refreshToken) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
    const doc = await sessionsRepo.findRefreshToken(sha256(refreshToken));
    if (!doc) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
    const now = Date.now();

    const session = await sessionsRepo.findById(doc.sessionId);
    const user = await usersRepo.findById(doc.userId);
    const sessionLive =
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > now &&
      user?.status === 'active';

    if (doc.usedAt) {
      if (sessionLive && now - doc.usedAt.getTime() < REFRESH_GRACE_MS) {
        // Two tabs refreshed at once: the other response already set the new refresh
        // cookie in this browser, so only a fresh access token is needed.
        return {
          accessToken: await this.accessFor(user, session._id),
          sessionExpiresAt: session.expiresAt,
        };
      }
      // Reuse of a rotated token = likely theft: kill the whole family (SECURITY §3.1).
      const revoked = await sessionsRepo.revoke(doc.userId, { sessionId: String(doc.sessionId) });
      await this.deps.state.markRevoked(revoked);
      await recordAudit({
        action: 'auth.refresh_reuse',
        actorUserId: String(doc.userId),
        target: { type: 'session', id: String(doc.sessionId) },
        ...this.auditClient(client),
      });
      this.deps.logger.warn({ sessionId: String(doc.sessionId) }, 'refresh token reuse detected');
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again');
    }
    if (!sessionLive || doc.expiresAt.getTime() <= now) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again');
    }

    const lastSeenAt = new Date(now);
    const expiresAt = new Date(
      Math.min(now + SESSION_IDLE_MS, session.createdAt.getTime() + SESSION_ABSOLUTE_MS),
    );
    const next = newOpaqueToken();
    const rotated = await inTransaction(async (s) => {
      if (!(await sessionsRepo.markRefreshUsed(doc._id, s))) return false;
      await sessionsRepo.createRefreshToken(
        {
          sessionId: session._id,
          userId: user._id,
          tokenHash: next.hash,
          familyId: doc.familyId,
          expiresAt,
        },
        s,
      );
      await sessionsRepo.touch(session._id, lastSeenAt, expiresAt, s);
      return true;
    });
    if (!rotated) return this.refresh(refreshToken, client); // lost the race → grace path
    return {
      accessToken: await this.accessFor(user, session._id),
      refreshToken: next.token,
      sessionExpiresAt: expiresAt,
    };
  }

  /** Revokes the session behind the refresh token or access token, if any. */
  async logout(
    refreshToken: string | undefined,
    sessionId: string | undefined,
    client: ClientMeta,
  ): Promise<void> {
    let target: { userId: Types.ObjectId | string; sessionId: string } | undefined;
    if (refreshToken) {
      const doc = await sessionsRepo.findRefreshToken(sha256(refreshToken));
      if (doc) target = { userId: doc.userId, sessionId: String(doc.sessionId) };
    }
    if (!target && sessionId) {
      const session = await sessionsRepo.findById(sessionId).catch(() => null);
      if (session) target = { userId: session.userId, sessionId };
    }
    if (!target) return;
    const revoked = await sessionsRepo.revoke(target.userId, { sessionId: target.sessionId });
    await this.deps.state.markRevoked(revoked);
    if (revoked.length) {
      await recordAudit({
        action: 'auth.logout',
        actorUserId: String(target.userId),
        target: { type: 'session', id: target.sessionId },
        ...this.auditClient(client),
      });
    }
  }

  // --- password reset & change -----------------------------------------------------

  async forgotPassword(email: string, turnstileToken: string, client: ClientMeta): Promise<void> {
    await this.requireCaptcha(turnstileToken, client);
    const user = await usersRepo.findByEmail(email);
    if (!user || user.status !== 'active') return;
    const link = newOpaqueToken();
    await inTransaction(async (s) => {
      await verificationRepo.invalidateOpen('password_reset', user._id, s);
      await verificationRepo.create(
        {
          purpose: 'password_reset',
          userId: user._id,
          email: user.email,
          tokenHash: link.hash,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
        s,
      );
      await this.email(s, 'password_reset', user.email, user.locale, {
        name: user.name,
        url: `${this.deps.appUrl}/reset?token=${link.token}`,
      });
    });
  }

  async resetPassword(token: string, password: string, client: ClientMeta): Promise<void> {
    const doc = await verificationRepo.find('password_reset', sha256(token));
    if (!doc?.subject.userId) throw invalidLink('invalid');
    if (doc.consumedAt) throw invalidLink('used');
    if (doc.expiresAt <= new Date()) throw invalidLink('expired');
    const user = await usersRepo.findById(doc.subject.userId);
    if (!user || user.status !== 'active') throw invalidLink('invalid');
    await this.rejectBreached(password);
    const passwordHash = await hashPassword(password);

    const revoked = await inTransaction(async (s) => {
      if (!(await verificationRepo.consume(doc._id, s))) throw invalidLink('used');
      await usersRepo.setPasswordHash(user._id, passwordHash, s);
      // The link proves control of the inbox, so it also verifies the email.
      await usersRepo.markEmailVerified(user._id, s);
      // A reset means the old password may be compromised: sign out everywhere.
      const ids = await sessionsRepo.revoke(user._id, {}, s);
      await this.email(s, 'password_changed', user.email, user.locale, { name: user.name });
      await recordAudit(
        {
          action: 'auth.password_reset',
          actorUserId: String(user._id),
          ...this.auditClient(client),
        },
        s,
      );
      return ids;
    });
    await this.deps.state.markRevoked(revoked);
    await this.deps.state.clearFailures(user.email);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: { currentPassword: string; newPassword: string },
    client: ClientMeta,
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Current password is incorrect', {
        errors: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
      });
    }
    await this.rejectBreached(input.newPassword, 'newPassword');
    const passwordHash = await hashPassword(input.newPassword);
    const revoked = await inTransaction(async (s) => {
      await usersRepo.setPasswordHash(user._id, passwordHash, s);
      const ids = await sessionsRepo.revoke(user._id, { exceptSessionId: currentSessionId }, s);
      await this.email(s, 'password_changed', user.email, user.locale, { name: user.name });
      await recordAudit(
        { action: 'auth.password_changed', actorUserId: userId, ...this.auditClient(client) },
        s,
      );
      return ids;
    });
    await this.deps.state.markRevoked(revoked);
  }

  // --- profile & sessions ----------------------------------------------------------

  async me(userId: string): Promise<Me> {
    const user = await this.requireUser(userId);
    return toMe(user, (await this.deps.workspacesFor?.(userId)) ?? []);
  }

  async updateMe(
    userId: string,
    patch: {
      name?: string | undefined;
      locale?: 'en' | 'hi' | undefined;
      timezone?: string | undefined;
    },
  ): Promise<Me> {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const user = await usersRepo.updateProfile(userId, clean);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
    return toMe(user, (await this.deps.workspacesFor?.(userId)) ?? []);
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const sessions = await sessionsRepo.listActive(userId);
    return sessions.map((s) => ({
      id: String(s._id),
      browser: s.device.browser,
      os: s.device.os,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: String(s._id) === currentSessionId,
    }));
  }

  /** Revoke one of the caller's sessions. Another user's id behaves like a missing one. */
  async revokeSession(userId: string, sessionId: string, client: ClientMeta): Promise<void> {
    const revoked = await sessionsRepo.revoke(userId, { sessionId });
    if (!revoked.length) throw AppError.notFound('Session');
    await this.deps.state.markRevoked(revoked);
    await recordAudit({
      action: 'auth.session_revoked',
      actorUserId: userId,
      target: { type: 'session', id: sessionId },
      ...this.auditClient(client),
    });
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, client: ClientMeta) {
    const revoked = await sessionsRepo.revoke(userId, { exceptSessionId: currentSessionId });
    await this.deps.state.markRevoked(revoked);
    if (revoked.length) {
      await recordAudit({
        action: 'auth.sessions_revoked',
        actorUserId: userId,
        meta: { count: revoked.length },
        ...this.auditClient(client),
      });
    }
    return revoked.length;
  }

  /** Used by the access verifier when Redis is unavailable. */
  isSessionRevoked(sessionId: string): Promise<boolean> {
    return sessionsRepo.isRevoked(sessionId);
  }

  // --- helpers ---------------------------------------------------------------------

  private async requireUser(userId: string): Promise<UserDoc> {
    const user = await usersRepo.findById(userId);
    if (!user || user.status !== 'active') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
    }
    return user;
  }

  private accessFor(user: UserDoc, sessionId: Types.ObjectId): Promise<string> {
    return this.deps.tokens.sign({
      userId: String(user._id),
      sessionId: String(sessionId),
      platformRole: user.platformRole,
    });
  }

  private async requireCaptcha(token: string | undefined, client: ClientMeta) {
    if (!(await this.deps.captcha.verify(token, client.ip))) {
      throw new AppError(403, 'CAPTCHA_REQUIRED', 'Please complete the security check');
    }
  }

  private async rejectBreached(password: string, path = 'password') {
    if (await this.deps.breach.isBreached(password)) {
      const message = 'This password has appeared in a data breach. Please choose a different one.';
      throw new AppError(400, 'VALIDATION_FAILED', message, { errors: [{ path, message }] });
    }
  }

  private async sendVerification(s: ClientSession, user: UserDoc) {
    const link = newOpaqueToken();
    await verificationRepo.invalidateOpen('email_verify', user._id, s);
    await verificationRepo.create(
      {
        purpose: 'email_verify',
        userId: user._id,
        email: user.email,
        tokenHash: link.hash,
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
      s,
    );
    await this.email(s, 'verify_email', user.email, user.locale, {
      name: user.name,
      url: `${this.deps.appUrl}/verify?token=${link.token}`,
    });
  }

  private async email(
    s: ClientSession,
    template: EmailTemplate,
    to: string,
    locale: 'en' | 'hi',
    data: Record<string, string>,
  ) {
    const job: EmailJob = { template, to, locale, data };
    await writeOutbox(s, [{ topic: 'notify.email', payload: { ...job } }]);
  }

  private auditClient(client: ClientMeta) {
    return {
      ipHash: client.ipHash,
      ...(client.requestId ? { requestId: client.requestId } : {}),
    };
  }
}

function toMe(user: UserDoc, workspaces: Workspace[]): Me {
  return {
    id: String(user._id),
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    name: user.name,
    locale: user.locale,
    timezone: user.timezone,
    platformRole: user.platformRole,
    workspaces,
  };
}
