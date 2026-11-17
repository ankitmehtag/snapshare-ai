import mongoose, { Schema, type Types } from 'mongoose';

export type VerificationPurpose =
  'email_verify' | 'password_reset' | 'email_change' | 'otp_guest' | 'otp_phone';

/** DATABASE_SCHEMA §2 `verificationTokens`: single-use, hashed, TTL-expired. */
export interface VerificationTokenDoc {
  _id: Types.ObjectId;
  purpose: VerificationPurpose;
  subject: { userId?: Types.ObjectId; email?: string; phone?: string };
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt?: Date;
}

const verificationTokenSchema = new Schema<VerificationTokenDoc>(
  {
    purpose: { type: String, required: true },
    subject: { userId: Schema.Types.ObjectId, email: String, phone: String },
    tokenHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { collection: 'verificationTokens', versionKey: false },
);

export const VerificationTokenModel =
  (mongoose.models.VerificationToken as mongoose.Model<VerificationTokenDoc> | undefined) ??
  mongoose.model<VerificationTokenDoc>('VerificationToken', verificationTokenSchema);
