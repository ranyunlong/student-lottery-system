import ExcelJS from 'exceljs';
import { appendStudentRow, MAX_STUDENT_ROWS, type ImportPreview } from './parse';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const headers = ['学号', '姓名', '性别'];

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
  let count = 0;
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    count++;
    if (count === MAX_STUDENT_ROWS + 1) {
      preview.errors.push({ line, message: '数据行不能超过 5,000 行' });
    }
    const values = [1, 2, 3].map((column) => cellText(row.getCell(column)));
    const cellErrors = values.flatMap(({ error }) => error ? [error] : []);
    const rowValues = row.values;
    if (Array.isArray(rowValues) && rowValues.slice(4).some((value) => value !== undefined && value !== null)) {
      cellErrors.push('只能填写学号、姓名、性别三列');
    }
    appendStudentRow(preview, seen, values.map(({ text }) => text), line, cellErrors);
  });
  return preview;
}
