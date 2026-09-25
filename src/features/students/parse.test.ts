import { expect, test } from 'vitest';
import { parsePastedStudents } from './parse';

test('parses trimmed TSV rows and optional gender without losing leading zeros', () => {
  expect(parsePastedStudents(' 001 \t 张三 \t男\r\n002\t李四\t')).toEqual({
    rows: [
      { studentNumber: '001', name: '张三', gender: 'male' },
      { studentNumber: '002', name: '李四', gender: null },
    ],
    errors: [],
  });
});

test('reports duplicate student numbers at the original line', () => {
  expect(parsePastedStudents('001\t甲\t男\n001\t乙\t女').errors).toEqual([
    { line: 2, message: expect.stringContaining('重复') },
  ]);
});

test('collects all row errors without renumbering lines or silently accepting extra columns', () => {
  const preview = parsePastedStudents('001\t甲\t男\n\n\t乙\t未知\n002\t\t女\n003\t丙\t男\t多余\n004\t丁\t女');
  expect(preview.rows).toEqual([
    { studentNumber: '001', name: '甲', gender: 'male' },
    { studentNumber: '004', name: '丁', gender: 'female' },
  ]);
  expect(preview.errors.map(({ line }) => line)).toEqual([3, 3, 4, 5]);
});

test('rejects more than 5000 pasted data rows', () => {
  const preview = parsePastedStudents(Array.from({ length: 5001 }, (_, i) => `${i}\t学生\t`).join('\n'));
  expect(preview.errors).toContainEqual({ line: 5001, message: expect.stringContaining('5,000') });
});

test('stops validation at 5000 data rows and reports only the first excess physical line', () => {
  const text = ['001\t甲\t男', '', '', ...Array.from({ length: 4999 }, () => '\t未命名\t'),
    '5001\t超限\t女', '5002\t更后\t男'].join('\n');
  const preview = parsePastedStudents(text);
  expect(preview.rows).toEqual([{ studentNumber: '001', name: '甲', gender: 'male' }]);
  expect(preview.errors).toHaveLength(5000);
  expect(preview.errors.at(-1)).toEqual({ line: 5003, message: expect.stringContaining('5,000') });
  expect(preview.errors.every(({ line }) => line <= 5003)).toBe(true);
});

test('caps error output from a large malformed TSV below the action body limit', () => {
  const preview = parsePastedStudents(Array.from({ length: 25000 }, () => '\t\t未知\t多余').join('\n'));
  expect(preview.rows).toEqual([]);
  expect(preview.errors).toHaveLength(5000 * 4 + 1);
  expect(preview.errors.at(-1)).toEqual({ line: 5001, message: expect.stringContaining('5,000') });
});
