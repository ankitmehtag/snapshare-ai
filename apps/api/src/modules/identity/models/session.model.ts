import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §2 `sessions`: one per signed-in device. */
export interface SessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  device: { ua: string; browser: string; os: string; ipHash: string };
  createdAt: Date;
  lastSeenAt: Date;
  /** min(lastSeenAt + 30 days idle, createdAt + 90 days absolute); TTL-indexed. */
  expiresAt: Date;
  revokedAt?: Date;
  mfaVerifiedAt?: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    device: {
      ua: String,
      browser: String,
      os: String,
      ipHash: String,
    },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    mfaVerifiedAt: Date,
  },
  { collection: 'sessions', versionKey: false },
);

export const SessionModel =
  (mongoose.models.Session as mongoose.Model<SessionDoc> | undefined) ??
  mongoose.model<SessionDoc>('Session', sessionSchema);
