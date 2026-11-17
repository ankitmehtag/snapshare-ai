import { defineConfig, devices } from '@playwright/test';

const E2E_MONGO = 'mongodb://127.0.0.1:27017/snapshare_e2e?directConnection=true';
const E2E_ENV = {
  MONGO_URL: E2E_MONGO,
  APP_URL: 'http://127.0.0.1:4173',
  CORS_ORIGINS: 'http://127.0.0.1:4173',
  // Each test browser gets its own X-Forwarded-For IP so rate limits don't collide.
  TRUST_PROXY: '1',
};

/**
 * Smoke tests and full-stack journeys against the production build (`vite preview`),
 * the built API and worker, and the local Docker services (`pnpm infra:up`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Primary audience browses on mid-range Android phones (PRD §9).
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Own database, migrated first; reads the rest of its config from the root .env.
      command:
        'node ./node_modules/migrate-mongo/bin/migrate-mongo.js up -f migrate-mongo-config.cjs && node --env-file-if-exists=../../.env dist/main.js',
      cwd: '../api',
      env: E2E_ENV,
      url: 'http://127.0.0.1:4000/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node --env-file-if-exists=../../.env dist/main.js all',
      cwd: '../worker',
      env: { ...E2E_ENV, WORKER_HEALTH_PORT: '4101' },
      url: 'http://127.0.0.1:4101/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
