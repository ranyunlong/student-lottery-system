import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { classes, students } from '../../db/schema';
import { requireClassAccess } from '../../lib/access';
import { MAX_STUDENT_ROWS, type StudentRow } from './parse';

export type Student = typeof students.$inferSelect;

function validateRows(rows: StudentRow[]): void {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_STUDENT_ROWS) {
    throw new Error('请输入 1 至 5,000 名学生');
  }
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.studentNumber !== 'string' || !row.studentNumber.trim()
      || row.studentNumber !== row.studentNumber.trim() || typeof row.name !== 'string'
      || !row.name.trim() || row.name !== row.name.trim()
      || ![null, 'male', 'female'].includes(row.gender)) {
      throw new Error('第 ' + (index + 1) + ' 行数据无效');
    }
    if (seen.has(row.studentNumber)) throw new Error('第 ' + (index + 1) + ' 行学号重复');
    seen.add(row.studentNumber);
  }
}

export async function importStudents(classId: string, rows: StudentRow[]): Promise<{ inserted: number; updated: number }> {
  await requireClassAccess(classId);
  validateRows(rows);
  return db.transaction(async (tx) => {
    // Serialize imports and assignment changes for this class before counting inserts.
    const [target] = await tx.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');
    const existing = await tx.select({ studentNumber: students.studentNumber }).from(students)
      .where(and(eq(students.classId, classId), inArray(students.studentNumber, rows.map((row) => row.studentNumber))));
    await tx.insert(students).values(rows.map((row) => ({ ...row, classId })))
      .onConflictDoUpdate({ target: [students.classId, students.studentNumber],
        set: { name: sql`excluded.name`, gender: sql`excluded.gender` },
      });
    return { inserted: rows.length - existing.length, updated: existing.length };
  });
}

export async function listStudents(classId: string): Promise<Student[]> {
  await requireClassAccess(classId);
  return db.select().from(students).where(eq(students.classId, classId)).orderBy(asc(students.studentNumber), asc(students.id));
}

async function setArchived(classId: string, studentId: number, archived: boolean): Promise<void> {
  await requireClassAccess(classId);
  if (!Number.isSafeInteger(studentId) || studentId <= 0) throw new Error('学生编号无效');
  const result = await db.update(students).set({ archived })
    .where(and(eq(students.classId, classId), eq(students.id, studentId), eq(students.archived, !archived)))
    .returning({ id: students.id });
  if (!result.length) throw new Error('学生不存在或状态未变化');
}

export async function archiveStudent(classId: string, studentId: number): Promise<void> {
  await setArchived(classId, studentId, true);
}

export async function restoreStudent(classId: string, studentId: number): Promise<void> {
  await setArchived(classId, studentId, false);
}
