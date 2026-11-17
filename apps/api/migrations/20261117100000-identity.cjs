// Phase 2A: identity collections (DATABASE_SCHEMA §2). Additive only (DEPLOYMENT §5).
// TTL indexes with expireAfterSeconds: 0 delete a document once its own expiresAt passes.

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) await db.createCollection(name);
}

const INDEXES = {
  users: [
    { key: { email: 1 }, name: 'email_unique', unique: true },
    {
      key: { 'oauth.provider': 1, 'oauth.subject': 1 },
      name: 'oauth_unique',
      unique: true,
      partialFilterExpression: { 'oauth.subject': { $exists: true } },
    },
    { key: { status: 1, deletionRequestedAt: 1 }, name: 'status_deletion' },
  ],
  sessions: [
    { key: { userId: 1, revokedAt: 1 }, name: 'user_revoked' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ],
  refreshTokens: [
    { key: { tokenHash: 1 }, name: 'tokenHash_unique', unique: true },
    { key: { familyId: 1 }, name: 'familyId' },
    { key: { sessionId: 1 }, name: 'sessionId' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ],
  verificationTokens: [
    { key: { tokenHash: 1 }, name: 'tokenHash_unique', unique: true },
    { key: { purpose: 1, 'subject.userId': 1 }, name: 'purpose_user' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
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
