// Phase 1: indexes for the transactional outbox (ARCHITECTURE §6.4) and the
// audit log (DATABASE_SCHEMA §12). Additive only (DEPLOYMENT §5).
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const TWO_YEARS = 2 * 365 * 24 * 60 * 60;

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) await db.createCollection(name);
}

module.exports = {
  async up(db) {
    await ensureCollection(db, 'outbox');
    await db.collection('outbox').createIndexes([
      { key: { status: 1, availableAt: 1 }, name: 'status_availableAt' },
      { key: { status: 1, leaseUntil: 1 }, name: 'status_leaseUntil' },
      // TTL applies only once publishedAt is set, i.e. to published entries.
      { key: { publishedAt: 1 }, name: 'publishedAt_ttl', expireAfterSeconds: SEVEN_DAYS },
    ]);

    await ensureCollection(db, 'auditLogs');
    await db.collection('auditLogs').createIndexes([
      { key: { 'scope.id': 1, at: -1 }, name: 'scope_at' },
      { key: { 'actor.userId': 1, at: -1 }, name: 'actor_at' },
      { key: { action: 1, at: -1 }, name: 'action_at' },
      { key: { at: 1 }, name: 'at_ttl', expireAfterSeconds: TWO_YEARS },
    ]);
  },

  async down(db) {
    for (const name of ['status_availableAt', 'status_leaseUntil', 'publishedAt_ttl']) {
      await db
        .collection('outbox')
        .dropIndex(name)
        .catch(() => undefined);
    }
    for (const name of ['scope_at', 'actor_at', 'action_at', 'at_ttl']) {
      await db
        .collection('auditLogs')
        .dropIndex(name)
        .catch(() => undefined);
    }
  },
};
