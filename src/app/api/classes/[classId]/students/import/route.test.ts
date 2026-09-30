// @vitest-environment node
import ExcelJS from 'exceljs';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseExcelStudents } from '../../../../../../features/students/excel';
import { importStudents } from '../../../../../../features/students/service';
import * as route from './route';

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('../../../../../../lib/access', () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireClassAccess: async () => { if (!access.allowed) throw new ForbiddenError(); },
  };
});
vi.mock('../../../../../../features/students/service', () => ({ importStudents: vi.fn(async () => ({ inserted: 1, updated: 0 })) }));

const classId = '831603ea-e316-4796-82f0-03e5acb3d85a';
const url = `http://localhost/api/classes/${classId}/students/import`;
beforeEach(() => { access.allowed = true; });

async function upload(intent: 'preview' | 'confirm') {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('学生名单').addRows([
    ['学号', '姓名', '性别'],
    ['00007', '赵六', '男'],
  ]);
  const form = new FormData();
  form.set('intent', intent);
  form.set('file', new File([await workbook.xlsx.writeBuffer()], 'students.xlsx'));
  return route.POST(new Request(url, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: form,
  }), { params: Promise.resolve({ classId }) });
}

async function download(id = classId) {
  expect(route).toHaveProperty('GET');
  return route.GET(new Request(url), { params: Promise.resolve({ classId: id }) });
}

test('downloads a blank, single-sheet XLSX template with text student numbers', async () => {
  const response = await download();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect(response.headers.get('content-disposition')).toContain('attachment;');
  expect(response.headers.get('content-disposition')).toContain('student-import-template.xlsx');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(workbook.worksheets).toHaveLength(1);
  const sheet = workbook.worksheets[0];
  expect(sheet.getRow(1).values).toEqual([undefined, '学号', '姓名', '性别']);
  expect(sheet.getCell('A2').numFmt).toBe('@');
  expect(sheet.getCell('A5001').numFmt).toBe('@');
  expect(await parseExcelStudents(bytes)).toEqual({ rows: [], errors: [] });

  sheet.getRow(2).values = ['00001', '张三', '男'];
  sheet.getRow(3).values = ['00002', '李四', '女'];
  sheet.getRow(4).values = ['00003', '王五', ''];
  expect(await parseExcelStudents(new Uint8Array(await workbook.xlsx.writeBuffer()))).toEqual({
    rows: [
      { studentNumber: '00001', name: '张三', gender: 'male' },
      { studentNumber: '00002', name: '李四', gender: 'female' },
      { studentNumber: '00003', name: '王五', gender: null },
    ], errors: [],
  });
});

test('denies template downloads without access to the class', async () => {
  access.allowed = false;
  expect((await download()).status).toBe(403);
});

test('rejects invalid class IDs before downloading a template', async () => {
  expect((await download('not-a-class-id')).status).toBe(400);
});

test('keeps Excel preview and confirmation imports working alongside template download', async () => {
  const preview = await upload('preview');
  expect(preview.status).toBe(200);
  expect(await preview.json()).toEqual({
    rows: [{ studentNumber: '00007', name: '赵六', gender: 'male' }],
    errors: [],
  });
  expect(importStudents).not.toHaveBeenCalled();

  const confirmation = await upload('confirm');
  expect(confirmation.status).toBe(200);
  expect(await confirmation.json()).toEqual({ inserted: 1, updated: 0 });
  expect(importStudents).toHaveBeenCalledWith(classId, [
    { studentNumber: '00007', name: '赵六', gender: 'male' },
  ]);
});
