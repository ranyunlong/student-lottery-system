import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const port = 3215;
const baseURL = `http://127.0.0.1:${port}`;
const databaseURL = process.env.E2E_RUN_DATABASE_URL;
const databaseName = process.env.E2E_RUN_DATABASE_NAME;

if (
  !databaseURL
  || process.env.DATABASE_URL !== databaseURL
  || !databaseName
  || !/^lottery_e2e_run_[a-f0-9]{32}$/.test(databaseName)
  || new URL(databaseURL).pathname !== `/${databaseName}`
) {
  throw new Error('Playwright may run only against the invocation-owned isolated E2E database.');
}

process.env.BETTER_AUTH_URL = baseURL;
process.env.EMBLEM_DIR = resolve('test-results/e2e-emblems');

export default defineConfig({
  testDir: './tests/e2e',
  globalTimeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
