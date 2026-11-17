// Phase 2B: tenancy collections (DATABASE_SCHEMA §3). Additive only (DEPLOYMENT §5).
// System roles are not seeded here: they are owned by code and upserted at API start
// (apps/api/src/modules/tenancy/services/system-roles.ts), so code and data can't drift.

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) await db.createCollection(name);
}

const INDEXES = {
  studios: [
    { key: { slug: 1 }, name: 'slug_unique', unique: true },
    { key: { ownerUserId: 1 }, name: 'ownerUserId' },
    { key: { status: 1, deletionRequestedAt: 1 }, name: 'status_deletion' },
  ],
  roles: [{ key: { tenantId: 1, key: 1 }, name: 'tenant_key_unique', unique: true }],
  memberships: [
    { key: { tenantId: 1, userId: 1 }, name: 'tenant_user_unique', unique: true },
    { key: { userId: 1, status: 1 }, name: 'user_status' },
    { key: { tenantId: 1, roleKey: 1 }, name: 'tenant_role' },
  ],
  invitations: [
    { key: { tokenHash: 1 }, name: 'tokenHash_unique', unique: true },
    { key: { 'target.tenantId': 1, status: 1 }, name: 'tenant_status' },
    { key: { email: 1, status: 1 }, name: 'email_status' },
    // Expired invitations are kept 30 days for the audit trail, then removed.
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 30 * 24 * 60 * 60 },
  ],
};

module.exports = {
  async up(db) {
    for (const [name, indexes] of Object.entries(INDEXES)) {
      await ensureCollection(db, name);
      await db.collection(name).createIndexes(indexes);
    }
  },

  async down(db) {
    for (const [name, indexes] of Object.entries(INDEXES)) {
      for (const { name: index } of indexes) {
        await db
          .collection(name)
          .dropIndex(index)
          .catch(() => undefined);
      }
    }
  },
};
