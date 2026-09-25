// @vitest-environment node
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { expect, test, vi } from 'vitest';
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
  expect(preview.errors.map(({ line }) => line)).toEqual([3, 4, 4, 4, 5, 5, 6, 6]);
});

test('reports physical blank data rows but ignores trailing blank styled rows', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.getRow(2).values = ['001', '甲', '男'];
    sheet.getRow(4).values = ['002', '乙', '女'];
    sheet.getCell('A6').font = { bold: true };
  });
  const preview = await parseExcelStudents(bytes);
  expect(preview.rows.map((row) => row.studentNumber)).toEqual(['001', '002']);
  expect(preview.errors).toEqual([
    { line: 3, message: '学号必填' },
    { line: 3, message: '姓名必填' },
  ]);
});

test('ignores trailing empty-string and whitespace cells after the last student', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.getRow(2).values = ['001', '甲', '男'];
    sheet.getCell('A3').value = '';
    sheet.getCell('B4').value = '   ';
  });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(loaded.getWorksheet(1)!.getCell('A3').value).toBe('');
  expect(loaded.getWorksheet(1)!.getCell('B4').value).toBe('   ');
  expect(await parseExcelStudents(bytes)).toEqual({
    rows: [{ studentNumber: '001', name: '甲', gender: 'male' }],
    errors: [],
  });
});

test('reports a whitespace-only middle row but ignores blank text after the last student', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.getRow(2).values = ['001', '甲', '男'];
    sheet.getCell('A3').value = '';
    sheet.getCell('B3').value = '  ';
    sheet.getRow(4).values = ['002', '乙', '女'];
    sheet.getCell('C5').value = ' ';
  });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(loaded.getWorksheet(1)!.getCell('B3').value).toBe('  ');
  expect((await parseExcelStudents(bytes)).errors).toEqual([
    { line: 3, message: '学号必填' },
    { line: 3, message: '姓名必填' },
  ]);
});

test('rejects a distant valued row before iterating through the blank physical range', async () => {
  const bytes = await xlsx((_, sheet) => { sheet.getRow(900000).values = ['001', '甲', '男']; });
  const preview = await parseExcelStudents(bytes);
  expect(preview.errors).toContainEqual({ line: 900000, message: expect.stringContaining('5,000') });
  expect(preview.rows).toEqual([]);
}, 15000);

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

test('rejects a highly compressed workbook before ExcelJS expands it', async () => {
  const bytes = await xlsx((_, sheet) => {
    sheet.getCell('D2').value = 'A'.repeat(34 * 1024 * 1024);
  });
  expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
  expect((await parseExcelStudents(bytes)).errors).toContainEqual({
    line: 0, message: expect.stringContaining('解压'),
  });
});

test('rejects archives with too many ZIP entries before ExcelJS parses worksheets', async () => {
  const bytes = await xlsx((book) => {
    for (let i = 0; i < 260; i++) book.addWorksheet(`额外${i}`);
  });
  expect((await parseExcelStudents(bytes)).errors).toContainEqual({
    line: 0, message: expect.stringContaining('条目'),
  });
});

test('rejects an entry whose actual expansion exceeds its central directory claim', async () => {
  const bytes = Buffer.from(await xlsx((_, sheet) => {
    sheet.getCell('D2').value = 'A'.repeat(1024 * 1024);
  }));
  const tampered = await new Promise<Uint8Array>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.once('error', reject);
      zip.on('entry', (entry) => {
        if (entry.fileName !== 'xl/sharedStrings.xml') return zip.readEntry();
        const cursor = (zip as unknown as { readEntryCursor: number }).readEntryCursor;
        const start = cursor - 46 - entry.fileNameLength - entry.extraFieldLength - entry.fileCommentLength;
        bytes.writeUInt32LE(1, start + 24);
        resolve(bytes);
      });
      zip.once('end', () => reject(new Error('Shared strings entry missing')));
      zip.readEntry();
    });
  });
  const xlsxPrototype = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx) as ExcelJS.Workbook['xlsx'];
  const load = vi.spyOn(xlsxPrototype, 'load');
  try {
    expect((await parseExcelStudents(tampered)).errors).toContainEqual({
      line: 0, message: expect.stringContaining('Excel'),
    });
    expect(load).not.toHaveBeenCalled();
  } finally {
    load.mockRestore();
  }
});
