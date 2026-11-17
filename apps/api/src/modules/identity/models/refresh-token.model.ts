import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §2 `refreshTokens`: rotating, with family reuse detection. */
export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  /** SHA-256 of the opaque token; the token itself is never stored. */
  tokenHash: string;
  familyId: string;
  usedAt?: Date;
  expiresAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    familyId: { type: String, required: true },
    usedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { collection: 'refreshTokens', versionKey: false },
);

export const RefreshTokenModel =
  (mongoose.models.RefreshToken as mongoose.Model<RefreshTokenDoc> | undefined) ??
  mongoose.model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
