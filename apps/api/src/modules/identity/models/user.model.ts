import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §2 `users`. Indexes live in migrations (autoIndex is off). */
export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  emailVerifiedAt?: Date;
  passwordHash?: string;
  name: string;
  oauth: { provider: 'google'; subject: string; linkedAt: Date }[];
  platformRole: 'none' | 'support' | 'admin';
  status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  deletionRequestedAt?: Date;
  locale: 'en' | 'hi';
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    emailVerifiedAt: Date,
    passwordHash: String,
    name: { type: String, required: true },
    oauth: {
      type: [{ provider: String, subject: String, linkedAt: Date, _id: false }],
      default: [],
    },
    platformRole: { type: String, enum: ['none', 'support', 'admin'], default: 'none' },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending_deletion', 'deleted'],
      default: 'active',
    },
    deletionRequestedAt: Date,
    locale: { type: String, enum: ['en', 'hi'], default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
  },
  { collection: 'users', timestamps: true, versionKey: false },
);

export const UserModel =
  (mongoose.models.User as mongoose.Model<UserDoc> | undefined) ??
  mongoose.model<UserDoc>('User', userSchema);
