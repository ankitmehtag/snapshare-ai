import mongoose, { Schema, type Types } from 'mongoose';

/**
 * DATABASE_SCHEMA §3 `roles`. System roles (tenantId null) are owned by code
 * (services/system-roles.ts) and upserted at API start; custom roles come later.
 */
export interface RoleDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  key: string;
  name: string;
  permissions: string[];
  system: boolean;
}

const roleSchema = new Schema<RoleDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, default: null },
    key: { type: String, required: true },
    name: { type: String, required: true },
    permissions: { type: [String], default: [] },
    system: { type: Boolean, default: false },
  },
  { collection: 'roles', versionKey: false },
);

export const RoleModel =
  (mongoose.models.Role as mongoose.Model<RoleDoc> | undefined) ??
  mongoose.model<RoleDoc>('Role', roleSchema);
