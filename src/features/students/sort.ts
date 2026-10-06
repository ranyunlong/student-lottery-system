export type StudentNumberSortDirection = 'asc' | 'desc';

const naturalNumberOrder = new Intl.Collator('en', { numeric: true });

export function compareStudentNumbers(
  left: string,
  right: string,
  direction: StudentNumberSortDirection = 'asc',
): number {
  const comparison = naturalNumberOrder.compare(left, right);
  return direction === 'asc' ? comparison : -comparison;
}

export function sortStudentsByNumber<T extends { studentNumber: string }>(
  students: readonly T[],
  direction: StudentNumberSortDirection = 'asc',
): T[] {
  return [...students].sort((left, right) => compareStudentNumbers(left.studentNumber, right.studentNumber, direction));
}
