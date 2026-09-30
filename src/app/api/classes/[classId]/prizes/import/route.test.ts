// @vitest-environment node
import ExcelJS from 'exceljs';
import { beforeEach, expect, test, vi } from 'vitest';
import { importPrizes } from '../../../../../../features/prizes/service';
import * as route from './route';

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('../../../../../../lib/access', () => {
  class ForbiddenError extends Error {}
  return { ForbiddenError, requireClassAccess: async () => { if (!access.allowed) throw new ForbiddenError(); } };
});
vi.mock('../../../../../../features/prizes/service', () => ({ importPrizes: vi.fn(async () => ({ inserted: 1, updated: 0 })) }));
const classId = '831603ea-e316-4796-82f0-03e5acb3d85a';
const url = `http://localhost/api/classes/${classId}/prizes/import`;
beforeEach(() => { access.allowed = true; vi.clearAllMocks(); });

async function upload(intent: string, origin = 'http://localhost') {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('奖品').addRows([['奖品名称', '补充数量'], ['铅笔', 4]]);
  const form = new FormData();
  form.set('intent', intent);
  form.set('file', new File([await book.xlsx.writeBuffer()], 'prizes.xlsx'));
  return route.POST(new Request(url, { method: 'POST', headers: { origin }, body: form }), { params: Promise.resolve({ classId }) });
}

test('downloads blank prize template only to authorized class members', async () => {
  const response = await route.GET(new Request(url), { params: Promise.resolve({ classId }) });
  expect(response.status).toBe(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  expect(book.worksheets[0].getRow(1).values).toEqual([undefined, '奖品名称', '补充数量']);
  access.allowed = false;
  expect((await route.GET(new Request(url), { params: Promise.resolve({ classId }) })).status).toBe(403);
});

test('preview validates without importing; confirmation imports exactly the parsed rows', async () => {
  const preview = await upload('preview');
  expect(preview.status).toBe(200);
  expect(await preview.json()).toEqual({ rows: [{ name: '铅笔', quantity: 4 }], errors: [] });
  expect(importPrizes).not.toHaveBeenCalled();
  const confirmed = await upload('confirm');
  expect(await confirmed.json()).toEqual({ inserted: 1, updated: 0 });
  expect(importPrizes).toHaveBeenCalledWith(classId, [{ name: '铅笔', quantity: 4 }]);
});

test('rejects cross-origin and unauthorized uploads', async () => {
  expect((await upload('confirm', 'http://evil.example')).status).toBe(403);
  access.allowed = false;
  expect((await upload('confirm')).status).toBe(403);
  expect(importPrizes).not.toHaveBeenCalled();
});

test('reports stock overflow as a validation error without crashing the upload response', async () => {
  vi.mocked(importPrizes).mockRejectedValueOnce(new Error('“铅笔”库存数量超出范围'));
  const response = await upload('confirm');
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ message: '“铅笔”库存数量超出范围' });
});
