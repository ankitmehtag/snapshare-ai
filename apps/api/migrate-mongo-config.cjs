// migrate-mongo configuration. Indexes are created only by migrations
// (autoIndex is off in the app — DATABASE_SCHEMA §15).
const url = process.env.MONGO_URL;
if (!url) throw new Error('MONGO_URL is required to run migrations');
const databaseName = new URL(url).pathname.replace(/^\//, '') || 'snapshare';

module.exports = {
  mongodb: { url, databaseName, options: {} },
  migrationsDir: 'migrations',
  changelogCollectionName: 'migrations_changelog',
  lockCollectionName: 'migrations_lock',
  lockTtl: 300,
  migrationFileExtension: '.cjs',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
