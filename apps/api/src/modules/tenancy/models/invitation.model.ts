import mongoose, { Schema, type Types } from 'mongoose';

/**
 * DATABASE_SCHEMA §3 `invitations`. Phase 2 creates `studio_member` invitations;
 * the other kinds reuse this collection in Phases 5 and 7.
 */
export interface InvitationDoc {
  _id: Types.ObjectId;
  kind: 'studio_member' | 'group_member' | 'proofing_client' | 'event_guest';
  target: { tenantId?: Types.ObjectId };
  email: string;
  roleKey: string;
  tokenHash: string;
  invitedBy: Types.ObjectId;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: Date;
  acceptedBy?: Types.ObjectId;
  createdAt: Date;
}

const invitationSchema = new Schema<InvitationDoc>(
  {
    kind: { type: String, required: true },
    target: { tenantId: Schema.Types.ObjectId },
    email: { type: String, required: true, lowercase: true },
    roleKey: { type: String, required: true },
    tokenHash: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
    },
    expiresAt: { type: Date, required: true },
    acceptedBy: Schema.Types.ObjectId,
  },
  {
    collection: 'invitations',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

export const InvitationModel =
  (mongoose.models.Invitation as mongoose.Model<InvitationDoc> | undefined) ??
  mongoose.model<InvitationDoc>('Invitation', invitationSchema);
