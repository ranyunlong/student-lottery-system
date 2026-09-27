import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { validateE2EDatabaseUrl } from './tests/e2e-support/runtime-env.mjs';

const port = 3215;
const baseURL = `http://127.0.0.1:${port}`;
const databaseURL = validateE2EDatabaseUrl();

process.env.DATABASE_URL = databaseURL;
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
