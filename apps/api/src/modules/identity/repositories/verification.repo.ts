import { Types, type ClientSession } from 'mongoose';
import {
  VerificationTokenModel,
  type VerificationPurpose,
  type VerificationTokenDoc,
} from '../models/verification-token.model.js';

const opts = (session?: ClientSession) => (session ? { session } : {});

export const verificationRepo = {
  async create(
    data: {
      purpose: VerificationPurpose;
      userId: Types.ObjectId;
      email: string;
      tokenHash: string;
      expiresAt: Date;
    },
    session?: ClientSession,
  ): Promise<void> {
    await VerificationTokenModel.create(
      [
        {
          purpose: data.purpose,
          subject: { userId: data.userId, email: data.email },
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      ],
      opts(session),
    );
  },

  find(purpose: VerificationPurpose, tokenHash: string): Promise<VerificationTokenDoc | null> {
    return VerificationTokenModel.findOne({ purpose, tokenHash }).lean<VerificationTokenDoc>();
  },

  /** Atomic single use: false if already consumed or expired. */
  async consume(id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const r = await VerificationTokenModel.updateOne(
      { _id: id, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      opts(session),
    );
    return r.modifiedCount === 1;
  },

  /** A new link invalidates older unused links of the same purpose for the user. */
  async invalidateOpen(
    purpose: VerificationPurpose,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await VerificationTokenModel.updateMany(
      { purpose, 'subject.userId': userId, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } },
      opts(session),
    );
  },
};
