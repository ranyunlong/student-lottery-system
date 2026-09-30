// @vitest-environment node
import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { createPrizeImportTemplate, parseExcelPrizes } from './excel';

test('template round trips as a blank two-column workbook', async () => {
  const bytes = await createPrizeImportTemplate();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(book.worksheets).toHaveLength(1);
  expect(book.worksheets[0].getRow(1).values).toEqual([undefined, '奖品名称', '补充数量']);
  expect(await parseExcelPrizes(bytes)).toEqual({ rows: [], errors: [] });
});

test('parses positive quantities and rejects duplicate names or unsafe values with line numbers', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('奖品');
  sheet.addRow(['奖品名称', '补充数量']);
  sheet.addRow(['铅笔', 3]);
  sheet.addRow([' 铅笔 ', 2]);
  sheet.addRow(['笔记本', 0]);
  sheet.addRow(['尺子', '5']);
  sheet.addRow(['橡皮', 2147483648]);
  const result = await parseExcelPrizes(new Uint8Array(await book.xlsx.writeBuffer()));
  expect(result.rows).toEqual([{ name: '铅笔', quantity: 3 }, { name: '尺子', quantity: 5 }]);
  expect(result.errors.map((entry) => entry.line)).toEqual([3, 4, 6]);
});

test('rejects extra columns and invalid workbooks', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('奖品');
  sheet.addRow(['奖品名称', '补充数量', '备注']);
  expect((await parseExcelPrizes(new Uint8Array(await book.xlsx.writeBuffer()))).errors).toHaveLength(1);
  expect((await parseExcelPrizes(new Uint8Array([1, 2, 3]))).errors).toHaveLength(1);
});
