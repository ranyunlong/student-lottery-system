import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import next from 'next';
import { chromium } from '@playwright/test';
import { assertChromiumInstalled, createRuntimeSecret, verifyE2EDatabaseIdentity } from '../e2e-support/runtime-env.mjs';

const hostname = '127.0.0.1';
const port = 3215;
const baseURL = `http://${hostname}:${port}`;
process.env.DATABASE_URL = await verifyE2EDatabaseIdentity();
assertChromiumInstalled(chromium.executablePath());
process.env.BETTER_AUTH_SECRET = createRuntimeSecret();
process.env.BETTER_AUTH_URL = baseURL;
process.env.EMBLEM_DIR = resolve('test-results/e2e-emblems');
process.env.CIRCLE_NODE_TOTAL = '2';

const app = next({ dev: true, dir: process.cwd(), hostname, port, webpack: true });
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end('Internal Server Error');
  });
});

let exitCode = 1;
try {
  await app.prepare();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, resolveListen);
  });
  console.log(`E2E Next server listening at ${baseURL}`);

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
  server.closeAllConnections();
  if (server.listening) {
    await Promise.race([
      new Promise((resolveClose) => server.close(resolveClose)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5000)),
    ]);
  }
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 5000)),
  ]);
  if (!closed) console.warn('Next development cleanup exceeded 5 seconds; exiting the isolated E2E runner.');
}

process.exit(exitCode);
