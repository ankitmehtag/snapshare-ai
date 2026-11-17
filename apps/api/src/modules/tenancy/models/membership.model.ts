import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §3 `memberships`: one per (studio, user). */
export interface MembershipDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  /** Denormalised from the role for listing; the role document stays authoritative. */
  roleKey: string;
  status: 'active' | 'suspended';
  invitedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<MembershipDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    roleId: { type: Schema.Types.ObjectId, required: true },
    roleKey: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    invitedBy: Schema.Types.ObjectId,
  },
  { collection: 'memberships', timestamps: true, versionKey: false },
);

export const MembershipModel =
  (mongoose.models.Membership as mongoose.Model<MembershipDoc> | undefined) ??
  mongoose.model<MembershipDoc>('Membership', membershipSchema);
