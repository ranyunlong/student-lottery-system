// @vitest-environment node
import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { parseExcelStudents } from './excel';

async function xlsx(make: (workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('学生');
  sheet.addRow(['学号', '姓名', '性别']);
  make(workbook, sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

test('reads real XLSX cells and preserves both text and numeric zero-padded numbers', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.addRow(['0012', '张三', '男']);
    const row = sheet.addRow([7, '李四', null]);
    row.getCell(1).numFmt = '00000';
  });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(loaded.getWorksheet(1)!.getCell('A3').text).toBe('7');
  expect(loaded.getWorksheet(1)!.getCell('A3').numFmt).toBe('00000');
  expect(await parseExcelStudents(bytes)).toEqual({
    rows: [
      { studentNumber: '0012', name: '张三', gender: 'male' },
      { studentNumber: '00007', name: '李四', gender: null },
    ], errors: [],
  });
});

test('requires exactly the three ordered Chinese headers', async () => {
  const bytes = await xlsx((_, sheet) => { sheet.getCell('A1').value = '姓名'; });
  expect((await parseExcelStudents(bytes)).errors).toContainEqual({
    line: 1, message: expect.stringContaining('学号'),
  });
});

test('requires one worksheet and rejects extra header columns', async () => {
  const extraSheet = await xlsx((book) => { book.addWorksheet('其他'); });
  expect((await parseExcelStudents(extraSheet)).errors).toContainEqual({
    line: 0, message: expect.stringContaining('一张'),
  });
  const extraHeader = await xlsx((_, sheet) => { sheet.getCell('D1').value = '备注'; });
  expect((await parseExcelStudents(extraHeader)).errors).toContainEqual({
    line: 1, message: expect.stringContaining('学号'),
  });
});

test('collects duplicates and invalid rows using physical worksheet line numbers', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.addRow(['001', '甲', '男']);
    sheet.addRow(['001', '乙', '女']);
    sheet.addRow([null, null, '其他']);
    sheet.getRow(7).values = ['002', '丙', '女'];
  });
  const preview = await parseExcelStudents(bytes);
  expect(preview.rows.map((row) => row.studentNumber)).toEqual(['001', '002']);
  expect(preview.errors.map(({ line }) => line)).toEqual([3, 4, 4, 4]);
});

test('rejects formulas, rich text, error cells and unsupported number formats instead of importing cached text', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.addRow([{ formula: '1+1', result: 2 }, '公式', '男']);
    sheet.addRow([{ richText: [{ text: '003' }] }, '富文本', '女']);
    sheet.addRow([{ error: '#N/A' }, '错误', '男']);
    const row = sheet.addRow([4, '格式', '女']);
    row.getCell(1).numFmt = '0.00E+00';
  });
  const preview = await parseExcelStudents(bytes);
  expect(preview.rows).toEqual([]);
  expect(preview.errors.map(({ line }) => line)).toEqual([2, 3, 4, 5]);
});

test('rejects files over 5 MiB and malformed XLSX contents', async () => {
  expect((await parseExcelStudents(new Uint8Array(5 * 1024 * 1024 + 1))).errors).toContainEqual({
    line: 0, message: expect.stringContaining('5 MiB'),
  });
  expect((await parseExcelStudents(new TextEncoder().encode('not an xlsx'))).errors).toContainEqual({
    line: 0, message: expect.stringContaining('Excel'),
  });
});

test('rejects more than 5000 data rows in an actual workbook', async () => {
  const bytes = await xlsx((_, sheet) => {
    for (let i = 1; i <= 5001; i++) sheet.addRow([String(i), '学生', '']);
  });
  const preview = await parseExcelStudents(bytes);
  expect(preview.errors).toContainEqual({ line: 5002, message: expect.stringContaining('5,000') });
});

test('accepts exactly 5000 data rows', async () => {
  const bytes = await xlsx((_, sheet) => {
    for (let i = 1; i <= 5000; i++) sheet.addRow([String(i), '学生', '']);
  });
  const preview = await parseExcelStudents(bytes);
  expect(preview.errors).toEqual([]);
  expect(preview.rows).toHaveLength(5000);
});

test('detects duplicates after applying a numeric student number format', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.addRow(['00007', '甲', '男']);
    const row = sheet.addRow([7, '乙', '女']);
    row.getCell(1).numFmt = '00000';
  });
  expect((await parseExcelStudents(bytes)).errors).toContainEqual({
    line: 3, message: expect.stringContaining('重复'),
  });
});
