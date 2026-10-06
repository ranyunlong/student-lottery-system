import { afterAll, expect, test } from 'vitest';

process.env.BETTER_AUTH_URL = 'https://luck.geckoai.cn';

const { auth } = await import('./auth');
const { pool } = await import('../db/client');

afterAll(async () => {
  await pool.end();
});

test('the production origin is trusted for authenticated auth requests', async () => {
  const response = await auth.handler(new Request('https://luck.geckoai.cn/api/auth/sign-out', {
    method: 'POST',
    headers: { origin: 'https://luck.geckoai.cn', cookie: 'better-auth.session=invalid-session' },
  }));

  expect(response.status).not.toBe(403);
});
