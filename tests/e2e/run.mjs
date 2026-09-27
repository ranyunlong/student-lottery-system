import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { assertChromiumInstalled, createRuntimeSecret } from '../e2e-support/runtime-env.mjs';
import { createE2ERunDatabase, removeE2ERunDatabase, verifyE2ERunDatabase } from '../e2e-support/run-database.mjs';

const hostname = '127.0.0.1';
const port = 3215;
const baseURL = `http://${hostname}:${port}`;
assertChromiumInstalled(chromium.executablePath());
const runDatabase = await createE2ERunDatabase();
process.env.DATABASE_URL = await verifyE2ERunDatabase(runDatabase);
process.env.E2E_RUN_DATABASE_URL = process.env.DATABASE_URL;
process.env.E2E_RUN_DATABASE_NAME = runDatabase.database;
process.env.BETTER_AUTH_SECRET = createRuntimeSecret();
process.env.BETTER_AUTH_URL = baseURL;
process.env.EMBLEM_DIR = resolve('test-results/e2e-emblems');
process.env.CIRCLE_NODE_TOTAL = '2';

async function stopE2EServer(child) {
  if (!child || child.exitCode !== null) return;
  if (child.connected) child.send({ type: 'shutdown' });
  const stopped = await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 10_000)),
  ]);
  if (!stopped) {
    child.kill('SIGKILL');
    await new Promise((resolveExit) => child.once('exit', resolveExit));
  }
}

let exitCode = 1;
let appServer;
try {
  appServer = spawn(process.execPath, [resolve('tests/e2e/server.mjs')], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for the isolated Next E2E server.')), 30_000);
    appServer.once('message', (message) => {
      if (message?.type !== 'ready') return;
      clearTimeout(timeout);
      resolveReady();
    });
    appServer.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    appServer.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Isolated Next E2E server exited before ready (code ${code ?? 'unknown'}).`));
    });
  });

  exitCode = await new Promise((resolveExit, reject) => {
    const runner = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    runner.once('error', reject);
    runner.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1));
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await stopE2EServer(appServer);
  try {
    await removeE2ERunDatabase(process.env.E2E_DATABASE_ADMIN_URL, runDatabase);
    console.log('Removed this invocation’s isolated E2E database and app role.');
  } catch {
    console.error('Could not remove this invocation’s isolated E2E database and app role; no unrelated database was targeted.');
    exitCode = 1;
  }
}

process.exit(exitCode);
