import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, students } from '../../db/schema';
import { ForbiddenError, requireClassAccess, requireSession } from '../../lib/access';
import { MAX_STUDENT_ROWS, type StudentRow } from './parse';
import { sortStudentsByNumber } from './sort';

export type Student = typeof students.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireMutationAccess(tx: Transaction, classId: string, userId: string): Promise<void> {
  const [target] = await tx.select({ archived: classes.archived }).from(classes)
    .where(eq(classes.id, classId)).for('update');
  if (!target || target.archived) throw new ForbiddenError('班级不存在或已归档');
  const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, userId)).for('share');
  if (!identity || identity.banned) throw new ForbiddenError('账号不可用');
  if (identity.mustChangePassword) throw new ForbiddenError('请先修改密码');
  if (identity.role === 'admin') return;
  if (identity.role !== 'user') throw new ForbiddenError();
  const [membership] = await tx.select({ classId: classTeachers.classId }).from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, userId))).for('share');
  if (!membership) throw new ForbiddenError();
}

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
  const { userId } = await requireSession();
  validateRows(rows);
  return db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
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
  const roster = await db.select().from(students).where(eq(students.classId, classId))
    .orderBy(asc(students.studentNumber), asc(students.id));
  return sortStudentsByNumber(roster);
}

async function setArchived(classId: string, studentId: number, archived: boolean): Promise<void> {
  const { userId } = await requireSession();
  if (!Number.isSafeInteger(studentId) || studentId <= 0) throw new Error('学生编号无效');
  await db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
    const result = await tx.update(students).set({ archived })
      .where(and(eq(students.classId, classId), eq(students.id, studentId), eq(students.archived, !archived)))
      .returning({ id: students.id });
    if (!result.length) throw new Error('学生不存在或状态未变化');
  });
}

export async function archiveStudent(classId: string, studentId: number): Promise<void> {
  await setArchived(classId, studentId, true);
}

export async function restoreStudent(classId: string, studentId: number): Promise<void> {
  await setArchived(classId, studentId, false);
}
