import type { Pool } from 'pg';
import type { NextRequest } from 'next/server';
import { pool } from '../../../db/client';

type HealthDatabase = Pick<Pool, 'query'>;
type RouteContext = { params: Promise<Record<string, never>> };

export function GET(): Promise<Response>;
export function GET(database: HealthDatabase): Promise<Response>;
export function GET(request: NextRequest, context: RouteContext): Promise<Response>;
export async function GET(
  requestOrDatabase?: NextRequest | HealthDatabase,
  _context?: RouteContext,
): Promise<Response> {
  void _context;
  const database = requestOrDatabase && 'query' in requestOrDatabase ? requestOrDatabase : pool;
  try {
    await database.query('SELECT 1');
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
