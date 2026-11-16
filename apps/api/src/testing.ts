// Shared helpers for API integration tests only.
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14';
export const TEST_MONGO_BASE = process.env.TEST_MONGO_URL ?? 'mongodb://127.0.0.1:27017';
export const TEST_QDRANT_URL = process.env.TEST_QDRANT_URL ?? 'http://127.0.0.1:6333';
export const TEST_QDRANT_KEY = process.env.QDRANT_API_KEY ?? 'snapshare-dev-qdrant-key';
