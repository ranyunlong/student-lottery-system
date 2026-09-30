import ExcelJS from 'exceljs';
import { validateZipLimits } from '../students/excel';

export type PrizeImportRow = { name: string; quantity: number };
export type PrizeImportPreview = { rows: PrizeImportRow[]; errors: { line: number; message: string }[] };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

export async function createPrizeImportTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('奖品与库存', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [{ width: 32, style: { numFmt: '@' } }, { width: 18, style: { numFmt: '0' } }];
  const header = sheet.addRow(['奖品名称', '补充数量']);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF9A3412' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
    cell.alignment = { vertical: 'middle' };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function parseExcelPrizes(bytes: Uint8Array): Promise<PrizeImportPreview> {
  const result: PrizeImportPreview = { rows: [], errors: [] };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ...result, errors: [{ line: 0, message: 'Excel 文件不能超过 5 MiB' }] };
  try { await validateZipLimits(bytes); }
  catch { return { ...result, errors: [{ line: 0, message: 'Excel 文件内容无效或超出解压限制' }] }; }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Uint8Array.from(bytes).buffer); }
  catch { return { ...result, errors: [{ line: 0, message: 'Excel 文件内容无效' }] }; }
  if (workbook.worksheets.length !== 1) return { ...result, errors: [{ line: 0, message: 'Excel 必须只有一张工作表' }] };
  const sheet = workbook.worksheets[0];
  const header = sheet.getRow(1);
  if (header.getCell(1).value !== '奖品名称' || header.getCell(2).value !== '补充数量'
    || header.cellCount > 2 && Array.isArray(header.values) && header.values.slice(3).some((value) => value !== undefined && value !== null)) {
    return { ...result, errors: [{ line: 1, message: '表头必须依次为奖品名称、补充数量，不能有额外列' }] };
  }
  let lastLine = 1;
  sheet.eachRow((row, line) => {
    if (row.values instanceof Array && row.values.some((value) => value !== undefined && value !== null && String(value).trim())) lastLine = line;
  });
  if (lastLine > MAX_ROWS + 1) result.errors.push({ line: lastLine, message: '数据行不能超过 500 行' });
  const seen = new Set<string>();
  for (let line = 2; line <= Math.min(lastLine, MAX_ROWS + 1); line++) {
    const row = sheet.getRow(line);
    const nameCell = row.getCell(1);
    const quantityCell = row.getCell(2);
    const name = nameCell.type === ExcelJS.ValueType.String ? String(nameCell.value).trim() : '';
    const raw = quantityCell.value;
    const quantity = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    const problems: string[] = [];
    if (!name || name.length > 200) problems.push('奖品名称必填且不能超过 200 字');
    if (name && seen.has(name)) problems.push('奖品名称重复');
    seen.add(name);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) problems.push('补充数量必须是 1 至 2147483647 的整数');
    if (Array.isArray(row.values) && row.values.slice(3).some((value) => value !== undefined && value !== null)) problems.push('只能填写奖品名称、补充数量两列');
    result.errors.push(...problems.map((message) => ({ line, message })));
    if (!problems.length) result.rows.push({ name, quantity });
  }
  return result;
}
