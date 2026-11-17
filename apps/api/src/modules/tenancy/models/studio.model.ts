import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §3 `studios`. `_id` is the tenantId of every studio-owned record. */
export interface StudioDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  ownerUserId: Types.ObjectId;
  branding: { primaryColor?: string; accentColor?: string; hideSnapshareBadge: boolean };
  contact: {
    email?: string;
    phone?: string;
    website?: string;
    instagram?: string;
    address?: string;
  };
  billingProfile?: { legalName?: string; gstin?: string; stateCode?: string; address?: string };
  settings: { defaultGalleryExpiryDays: number; stripGps: boolean; aiDefaultEnabled: boolean };
  status: 'active' | 'suspended' | 'pending_deletion';
  deletionRequestedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const studioSchema = new Schema<StudioDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    ownerUserId: { type: Schema.Types.ObjectId, required: true },
    branding: {
      primaryColor: String,
      accentColor: String,
      hideSnapshareBadge: { type: Boolean, default: false },
    },
    contact: { email: String, phone: String, website: String, instagram: String, address: String },
    billingProfile: { legalName: String, gstin: String, stateCode: String, address: String },
    settings: {
      defaultGalleryExpiryDays: { type: Number, default: 90 },
      stripGps: { type: Boolean, default: true },
      aiDefaultEnabled: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending_deletion'],
      default: 'active',
    },
    deletionRequestedAt: Date,
  },
  { collection: 'studios', timestamps: true, versionKey: false, minimize: false },
);

export const StudioModel =
  (mongoose.models.Studio as mongoose.Model<StudioDoc> | undefined) ??
  mongoose.model<StudioDoc>('Studio', studioSchema);
