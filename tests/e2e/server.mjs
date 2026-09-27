import { createServer } from 'node:http';

const hostname = '127.0.0.1';
const port = 3215;
let app;
let server;
let stopping = false;

async function stopServer() {
  if (stopping) return;
  stopping = true;
  server?.closeAllConnections();
  if (server?.listening) {
    await Promise.race([
      new Promise((resolveClose) => server.close(resolveClose)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5000)),
    ]);
  }
  if (app) {
    await Promise.race([
      app.close(),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5000)),
    ]);
  }
  process.exit(0);
}

process.on('message', (message) => {
  if (message?.type === 'shutdown') void stopServer();
});

try {
  const { default: next } = await import('next');
  app = next({ dev: true, dir: process.cwd(), hostname, port, webpack: true });
  const handle = app.getRequestHandler();
  await app.prepare();
  server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.statusCode = 500;
      response.end('Internal Server Error');
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, resolveListen);
  });
  console.log(`E2E Next server listening at http://${hostname}:${port}`);
  process.send?.({ type: 'ready' });
} catch {
  console.error('Could not start the isolated Next E2E server.');
  process.exit(1);
}
