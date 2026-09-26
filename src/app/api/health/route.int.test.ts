import { afterAll, beforeAll, expect, test } from 'vitest';
import { Pool } from 'pg';
import { GET } from './route';

const databaseUrl = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: databaseUrl });

beforeAll(async () => {
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

test('数据库可用时报告健康', async () => {
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('数据库不可用时报告服务不可用', async () => {
  const unavailablePool = new Pool({ connectionString: 'postgres://invalid:invalid@127.0.0.1:1/unavailable' });

  try {
    const response = await GET(unavailablePool);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  } finally {
    await unavailablePool.end().catch(() => undefined);
  }
});
