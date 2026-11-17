import mongoose, { Schema, type Types } from 'mongoose';

/** DATABASE_SCHEMA §12 `auditLogs`. Append-only (SECURITY §6). */
export interface AuditLogDoc {
  _id: Types.ObjectId;
  at: Date;
  actor: { userId?: Types.ObjectId; platformRole?: string };
  scope?: { type: 'studio' | 'personal' | 'platform'; id: Types.ObjectId };
  action: string;
  target?: { type: string; id: string };
  ipHash?: string;
  requestId?: string;
  /** Small, redacted context. Never secrets, tokens, passwords or embeddings. */
  meta?: Record<string, string | number | boolean>;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    actor: {
      userId: Schema.Types.ObjectId,
      platformRole: String,
    },
    scope: { type: { type: String }, id: Schema.Types.ObjectId },
    action: { type: String, required: true },
    target: { type: { type: String }, id: String },
    ipHash: String,
    requestId: String,
    meta: Schema.Types.Mixed,
  },
  { collection: 'auditLogs', versionKey: false, minimize: true },
);

export const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<AuditLogDoc> | undefined) ??
  mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema);
