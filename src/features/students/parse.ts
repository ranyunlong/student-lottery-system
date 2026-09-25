export type StudentRow = {
  studentNumber: string;
  name: string;
  gender: 'male' | 'female' | null;
};

export type ImportPreview = {
  rows: StudentRow[];
  errors: { line: number; message: string }[];
};

export const MAX_STUDENT_ROWS = 5000;

export function appendStudentRow(
  preview: ImportPreview,
  seen: Set<string>,
  cells: string[],
  line: number,
  cellErrors: string[] = [],
): void {
  const [studentNumber = '', name = '', genderText = ''] = cells.map((cell) => cell.trim());
  const errors: string[] = [...cellErrors];
  if (cells.length > 3) errors.push('只能填写学号、姓名、性别三列');
  if (!studentNumber) errors.push('学号必填');
  if (!name) errors.push('姓名必填');
  if (genderText && genderText !== '男' && genderText !== '女') errors.push('性别只能是男、女或留空');
  if (studentNumber) {
    if (seen.has(studentNumber)) errors.push('学号重复');
    else seen.add(studentNumber);
  }
  preview.errors.push(...errors.map((message) => ({ line, message })));
  if (errors.length === 0) {
    preview.rows.push({
      studentNumber,
      name,
      gender: genderText === '男' ? 'male' : genderText === '女' ? 'female' : null,
    });
  }
}

export function parsePastedStudents(text: string): ImportPreview {
  const preview: ImportPreview = { rows: [], errors: [] };
  const seen = new Set<string>();
  let count = 0;
  for (const [index, rawLine] of text.split(/\r\n|\n|\r/).entries()) {
    if (!rawLine.trim()) continue;
    count++;
    if (count === MAX_STUDENT_ROWS + 1) {
      preview.errors.push({ line: index + 1, message: '数据行不能超过 5,000 行' });
    }
    appendStudentRow(preview, seen, rawLine.split('\t'), index + 1);
  }
  return preview;
}
