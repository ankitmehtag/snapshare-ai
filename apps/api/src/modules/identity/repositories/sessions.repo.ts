import { Types, type ClientSession } from 'mongoose';
import { RefreshTokenModel, type RefreshTokenDoc } from '../models/refresh-token.model.js';
import { SessionModel, type SessionDoc } from '../models/session.model.js';

const opts = (session?: ClientSession) => (session ? { session } : {});

/** Sessions and their refresh tokens: always selected by the owner's userId. */
export const sessionsRepo = {
  async create(
    data: Pick<SessionDoc, 'userId' | 'device' | 'expiresAt'>,
    session?: ClientSession,
  ): Promise<SessionDoc> {
    const [doc] = await SessionModel.create([data], opts(session));
    return doc!.toObject();
  },

  findById(id: Types.ObjectId | string): Promise<SessionDoc | null> {
    return SessionModel.findById(id).lean<SessionDoc>();
  },

  listActive(userId: string): Promise<SessionDoc[]> {
    return SessionModel.find({
      userId: new Types.ObjectId(userId),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastSeenAt: -1 })
      .limit(100)
      .lean<SessionDoc[]>();
  },

  async touch(id: Types.ObjectId, lastSeenAt: Date, expiresAt: Date, session?: ClientSession) {
    await SessionModel.updateOne(
      { _id: id, revokedAt: { $exists: false } },
      { $set: { lastSeenAt, expiresAt } },
      opts(session),
    );
  },

  /** Revokes the given sessions of this user; returns the ids actually revoked. */
  async revoke(
    userId: Types.ObjectId | string,
    filter: { sessionId?: string; exceptSessionId?: string } = {},
    session?: ClientSession,
  ): Promise<string[]> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(String(userId)),
      revokedAt: { $exists: false },
    };
    if (filter.sessionId) query._id = new Types.ObjectId(filter.sessionId);
    if (filter.exceptSessionId) query._id = { $ne: new Types.ObjectId(filter.exceptSessionId) };
    const targets = await SessionModel.find(query, { _id: 1 }, opts(session)).lean();
    const ids = targets.map((t) => t._id);
    if (!ids.length) return [];
    const now = new Date();
    await SessionModel.updateMany(
      { _id: { $in: ids } },
      { $set: { revokedAt: now } },
      opts(session),
    );
    await RefreshTokenModel.updateMany(
      { sessionId: { $in: ids }, usedAt: { $exists: false } },
      { $set: { usedAt: now } },
      opts(session),
    );
    return ids.map(String);
  },

  async isRevoked(sessionId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(sessionId)) return true;
    const s = await SessionModel.findById(sessionId, { revokedAt: 1, expiresAt: 1 }).lean();
    return !s || Boolean(s.revokedAt) || s.expiresAt <= new Date();
  },

  async createRefreshToken(
    data: Pick<RefreshTokenDoc, 'sessionId' | 'userId' | 'tokenHash' | 'familyId' | 'expiresAt'>,
    session?: ClientSession,
  ): Promise<void> {
    await RefreshTokenModel.create([data], opts(session));
  },

  findRefreshToken(tokenHash: string): Promise<RefreshTokenDoc | null> {
    return RefreshTokenModel.findOne({ tokenHash }).lean<RefreshTokenDoc>();
  },

  /** Atomically marks a token used; false if someone else used it first. */
  async markRefreshUsed(id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const r = await RefreshTokenModel.updateOne(
      { _id: id, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
      opts(session),
    );
    return r.modifiedCount === 1;
  },
};
