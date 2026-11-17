import { Types, type ClientSession } from 'mongoose';
import { UserModel, type UserDoc } from '../models/user.model.js';

const opts = (session?: ClientSession) => (session ? { session } : {});

/**
 * Users are global (not tenant-owned): a person can belong to many studios.
 * Every lookup is by the caller's own id or by an email the caller supplied.
 */
export const usersRepo = {
  findById(id: string | Types.ObjectId): Promise<UserDoc | null> {
    return UserModel.findById(id).lean<UserDoc>();
  },

  findByIds(ids: Types.ObjectId[]): Promise<UserDoc[]> {
    return UserModel.find({ _id: { $in: ids } }).lean<UserDoc[]>();
  },

  findByEmail(email: string): Promise<UserDoc | null> {
    return UserModel.findOne({ email }).lean<UserDoc>();
  },

  async create(
    data: Pick<UserDoc, 'email' | 'name' | 'passwordHash' | 'locale'>,
    session?: ClientSession,
  ): Promise<UserDoc> {
    const [doc] = await UserModel.create([data], opts(session));
    return doc!.toObject();
  },

  async markEmailVerified(id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
    const r = await UserModel.updateOne(
      { _id: id, emailVerifiedAt: { $exists: false } },
      { $set: { emailVerifiedAt: new Date() } },
      opts(session),
    );
    return r.modifiedCount === 1;
  },

  async setPasswordHash(id: Types.ObjectId, passwordHash: string, session?: ClientSession) {
    await UserModel.updateOne({ _id: id }, { $set: { passwordHash } }, opts(session));
  },

  async updateProfile(
    id: string,
    patch: Partial<Pick<UserDoc, 'name' | 'locale' | 'timezone'>>,
  ): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { returnDocument: 'after', runValidators: true },
    ).lean<UserDoc>();
  },
};

export type { UserDoc };
