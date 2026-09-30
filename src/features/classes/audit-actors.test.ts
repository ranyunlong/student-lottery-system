import { afterEach, expect, test, vi } from 'vitest';

const queryMocks = vi.hoisted(() => ({
  select: vi.fn(),
  inArray: vi.fn((_column: unknown, ids: string[]) => ids),
}));

vi.mock('drizzle-orm', () => ({ inArray: queryMocks.inArray }));
vi.mock('../../db/client', () => ({ db: { select: queryMocks.select } }));
vi.mock('../../db/auth-schema', () => ({ user: { id: 'user-id', name: 'user-name' } }));

import { listAuditActorNames } from './audit-actors';

afterEach(() => vi.clearAllMocks());

test('returns linked actor names from one query with duplicate ids removed', async () => {
  const rows = [{ id: 'actor-1', name: '陈老师' }, { id: 'actor-2', name: '周老师' }];
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  queryMocks.select.mockReturnValue({ from });

  const result = await listAuditActorNames(['actor-1', 'actor-1', 'actor-2']);

  expect(queryMocks.select).toHaveBeenCalledWith({ id: 'user-id', name: 'user-name' });
  expect(queryMocks.inArray).toHaveBeenCalledWith('user-id', ['actor-1', 'actor-2']);
  expect(result).toEqual(new Map([['actor-1', '陈老师'], ['actor-2', '周老师']]));
});

test('skips the user query when the page has no actors', async () => {
  expect(await listAuditActorNames([])).toEqual(new Map());
  expect(queryMocks.select).not.toHaveBeenCalled();
});
