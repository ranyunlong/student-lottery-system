import { expect, test } from 'vitest';
import { auditStudentPattern, shanghaiAuditDay } from './audit-filters';

test('Shanghai audit day spans the displayed local calendar day', () => {
  expect(shanghaiAuditDay('2026-09-01')).toEqual({
    from: new Date('2026-08-31T16:00:00.000Z'),
    to: new Date('2026-09-01T16:00:00.000Z'),
  });
  expect(shanghaiAuditDay('2026-02-30')).toBeNull();
  expect(shanghaiAuditDay('not a date')).toBeNull();
});

test('student keyword is trimmed and LIKE wildcards are literal', () => {
  expect(auditStudentPattern('  %_!甲  ')).toBe('%!%!_!!甲%');
  expect(auditStudentPattern('  ')).toBeNull();
});
