import ExcelJS from 'exceljs';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { Readable } from 'node:stream';
import { appendStudentRow, MAX_STUDENT_ROWS, type ImportPreview } from './parse';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 256;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const headers = ['学号', '姓名', '性别'];

export async function createStudentImportTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('学生名单', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { width: 24, style: { numFmt: '@' } },
    { width: 20, style: { numFmt: '@' } },
    { width: 12, style: { numFmt: '@' } },
  ];
  const header = sheet.addRow(headers);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FF115E59' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    cell.alignment = { vertical: 'middle' };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

class ZipLimitError extends Error {}

export async function validateZipLimits(bytes: Uint8Array): Promise<void> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      { lazyEntries: true, validateEntrySizes: true },
      (error, file) => error ? reject(error) : resolve(file));
  });
  if (zip.entryCount > MAX_ZIP_ENTRIES) throw new ZipLimitError('ZIP 条目不能超过 256 个');

  const entries = await new Promise<Entry[]>((resolve, reject) => {
    const found: Entry[] = [];
    let declaredBytes = 0;
    zip.once('error', reject);
    zip.once('end', () => resolve(found));
    zip.on('entry', (entry: Entry) => {
      if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) {
        reject(new Error('Unsupported ZIP entry'));
        return;
      }
      declaredBytes += entry.uncompressedSize;
      if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_UNCOMPRESSED_BYTES) {
        reject(new ZipLimitError('Excel 解压内容不能超过 32 MiB'));
        return;
      }
      found.push(entry);
      zip.readEntry();
    });
    zip.readEntry();
  });

  let actualBytes = 0;
  for (const entry of entries) {
    const stream = await new Promise<Readable>((resolve, reject) => {
      zip.openReadStream(entry, (error, opened) => error ? reject(error) : resolve(opened));
    });
    let entryBytes = 0;
    for await (const chunk of stream) {
      entryBytes += (chunk as Buffer).byteLength;
      actualBytes += (chunk as Buffer).byteLength;
      if (entryBytes > entry.uncompressedSize || actualBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new ZipLimitError('Excel 解压内容不能超过 32 MiB');
      }
    }
    if (entryBytes !== entry.uncompressedSize) throw new Error('ZIP entry size mismatch');
  }
}

function cellText(cell: ExcelJS.Cell): { text: string; error?: string } {
  if (cell.type === ExcelJS.ValueType.Null) return { text: '' };
  if (cell.type === ExcelJS.ValueType.String) return { text: cell.value as string };
  if (cell.type === ExcelJS.ValueType.Number) {
    const value = cell.value as number;
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      return { text: cell.text, error: '数值学号或单元格超出安全精度' };
    }
    if (cell.numFmt === 'General' || cell.numFmt === '@') return { text: String(value) };
    if (/^0+$/.test(cell.numFmt) && value >= 0) {
      return { text: String(value).padStart(cell.numFmt.length, '0') };
    }
    return { text: cell.text, error: '不支持的数值单元格格式，请改为文本' };
  }
  return { text: cell.text, error: '不支持公式、富文本或错误单元格，请改为普通文本' };
}

export async function parseExcelStudents(bytes: Uint8Array): Promise<ImportPreview> {
  const preview: ImportPreview = { rows: [], errors: [] };
  if (bytes.byteLength > MAX_EXCEL_BYTES) {
    preview.errors.push({ line: 0, message: 'Excel 文件不能超过 5 MiB' });
    return preview;
  }

  try {
    await validateZipLimits(bytes);
  } catch (error) {
    preview.errors.push({ line: 0, message: error instanceof ZipLimitError ? error.message : 'Excel 文件内容无效' });
    return preview;
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    preview.errors.push({ line: 0, message: 'Excel 文件内容无效' });
    return preview;
  }
  if (workbook.worksheets.length !== 1) {
    preview.errors.push({ line: 0, message: 'Excel 必须只有一张工作表' });
    return preview;
  }
  const sheet = workbook.worksheets[0];
  const header = sheet.getRow(1);
  const headerValues = header.values;
  if (headers.some((value, index) => header.getCell(index + 1).value !== value)
    || Array.isArray(headerValues) && headerValues.slice(4).some((value) => value !== undefined && value !== null)) {
    preview.errors.push({ line: 1, message: '表头必须依次为学号、姓名、性别，不能有额外列' });
    return preview;
  }

  const seen = new Set<string>();
  let lastDataLine = 1;
  sheet.eachRow((row, line) => {
    let hasContent = false;
    row.eachCell((cell) => {
      const { text, error } = cellText(cell);
      if (error || text.trim()) hasContent = true;
    });
    if (hasContent) lastDataLine = line;
  });
  if (lastDataLine > MAX_STUDENT_ROWS + 1) {
    preview.errors.push({ line: lastDataLine, message: '数据行不能超过 5,000 行' });
  }
  for (let line = 2; line <= Math.min(lastDataLine, MAX_STUDENT_ROWS + 1); line++) {
    const row = sheet.getRow(line);
    const values = [1, 2, 3].map((column) => cellText(row.getCell(column)));
    const cellErrors = values.flatMap(({ error }) => error ? [error] : []);
    const rowValues = row.values;
    if (Array.isArray(rowValues) && rowValues.slice(4).some((value) => value !== undefined && value !== null)) {
      cellErrors.push('只能填写学号、姓名、性别三列');
    }
    appendStudentRow(preview, seen, values.map(({ text }) => text), line, cellErrors);
  }
  return preview;
}
