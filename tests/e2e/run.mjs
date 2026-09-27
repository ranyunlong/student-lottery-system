import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import {
  assertChromiumInstalled,
  createE2EChildEnvironment,
  createRuntimeSecret,
} from '../e2e-support/runtime-env.mjs';
import {
  acquireE2ERunLease,
  createE2ERunDatabase,
  recoverE2ERunDatabase,
  removeE2ERunDatabase,
  verifyE2ERunDatabase,
} from '../e2e-support/run-database.mjs';

const hostname = '127.0.0.1';
const port = 3215;
const baseURL = `http://${hostname}:${port}`;
const recoveryArgs = process.argv.slice(2).filter((argument) => argument.startsWith('--recover='));

if (recoveryArgs.length > 0) {
  if (recoveryArgs.length !== 1 || process.argv.length !== 3) {
    throw new Error('Use only `node tests/e2e/run.mjs --recover=<run-id>` for explicit E2E resource recovery.');
  }
  const runId = recoveryArgs[0].slice('--recover='.length);
  await recoverE2ERunDatabase(process.env.E2E_DATABASE_ADMIN_URL, runId);
  console.log(`Recovered invocation-owned E2E resources for run ${runId}.`);
} else {
  assertChromiumInstalled(chromium.executablePath());

  let exitCode = 1;
  let runDatabase;
  let releaseLease;
  let appServer;
  let playwrightRunner;
  let receivedSignal;
  let forceStopTimer;

  const signalPromise = new Promise((resolveSignal) => {
    const handleSignal = (signal) => {
      if (receivedSignal) return;
      receivedSignal = signal;
      console.log(`Received ${signal}; beginning bounded E2E shutdown.`);
      resolveSignal(signal);
      if (playwrightRunner && playwrightRunner.exitCode === null) {
        playwrightRunner.kill('SIGTERM');
        forceStopTimer = setTimeout(() => {
          if (playwrightRunner.exitCode === null) playwrightRunner.kill('SIGKILL');
        }, 10_000);
      }
      if (appServer?.connected) appServer.send({ type: 'shutdown' });
    };
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
  });

  async function stopChild(child, gracefulStop) {
    if (!child || child.exitCode !== null) return true;
    gracefulStop?.();
    const waitForExit = (milliseconds) => new Promise((resolveExit) => {
      let settled = false;
      const finish = (didExit) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeListener('exit', handleExit);
        resolveExit(didExit);
      };
      const handleExit = () => finish(true);
      const timer = setTimeout(() => finish(false), milliseconds);
      child.once('exit', handleExit);
    });
    const exited = await waitForExit(10_000);
    if (exited) return true;
    child.kill('SIGKILL');
    return waitForExit(5000);
  }

  try {
    runDatabase = await createE2ERunDatabase();
    releaseLease = await acquireE2ERunLease(process.env.E2E_DATABASE_ADMIN_URL, runDatabase);
    console.log(`E2E run ID: ${runDatabase.database.slice('lottery_e2e_run_'.length)}`);

    const databaseUrl = await verifyE2ERunDatabase(runDatabase);
    const runtimeEnvironment = {
      DATABASE_URL: databaseUrl,
      E2E_RUN_DATABASE_URL: databaseUrl,
      E2E_RUN_DATABASE_NAME: runDatabase.database,
      BETTER_AUTH_SECRET: createRuntimeSecret(),
      BETTER_AUTH_URL: baseURL,
      EMBLEM_DIR: resolve('test-results/e2e-emblems'),
      CIRCLE_NODE_TOTAL: '2',
    };
    const childEnv = createE2EChildEnvironment(process.env, runtimeEnvironment);

    if (receivedSignal) throw new Error(`Interrupted by ${receivedSignal} before app startup.`);
    appServer = spawn(process.execPath, [resolve('tests/e2e/server.mjs')], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });

    await Promise.race([
      new Promise((resolveReady, reject) => {
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
      }),
      signalPromise.then((signal) => { throw new Error(`Interrupted by ${signal} while starting Next.`); }),
    ]);

    if (receivedSignal) throw new Error(`Interrupted by ${receivedSignal} before Playwright startup.`);
    const runnerExit = new Promise((resolveExit, reject) => {
      playwrightRunner = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], {
        cwd: process.cwd(),
        env: childEnv,
        stdio: 'inherit',
      });
      playwrightRunner.once('error', reject);
      playwrightRunner.once('exit', (code, signal) => resolveExit(signal ? 1 : code ?? 1));
    });
    exitCode = await Promise.race([
      runnerExit,
      signalPromise.then((signal) => signal === 'SIGINT' ? 130 : 143),
    ]);
  } catch (error) {
    if (!receivedSignal) console.error(error);
    exitCode = receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 1;
  } finally {
    clearTimeout(forceStopTimer);
    const serverStopped = await stopChild(appServer, () => {
      if (appServer.connected) appServer.send({ type: 'shutdown' });
    });
    const runnerStopped = await stopChild(playwrightRunner, () => {
      if (playwrightRunner.exitCode === null) playwrightRunner.kill('SIGTERM');
    });

    if (runDatabase && serverStopped && runnerStopped) {
      try {
        await removeE2ERunDatabase(process.env.E2E_DATABASE_ADMIN_URL, runDatabase);
        console.log('Removed this invocation’s isolated E2E database and app role.');
      } catch (error) {
        const runId = runDatabase.database.slice('lottery_e2e_run_'.length);
        console.error(`Could not clean E2E run ${runId} after bounded retries.`);
        console.error(`Recover after confirming no E2E process is active: node tests/e2e/run.mjs --recover=${runId}`);
        console.error(error.message);
        exitCode = 1;
      }
    } else if (runDatabase) {
      const runId = runDatabase.database.slice('lottery_e2e_run_'.length);
      console.error(`E2E child process did not stop; run ${runId} was preserved.`);
      console.error(`After confirming the process has stopped, recover with: node tests/e2e/run.mjs --recover=${runId}`);
      exitCode = 1;
    }

    if (releaseLease) await releaseLease().catch(() => {});
  }

  process.exitCode = exitCode;
}
