import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { classes, classTeachers, students } from '../../db/schema';
import { auth } from '../../lib/auth';
import { removeTeacher } from '../classes/service';
import { importStudents, listStudents, archiveStudent, restoreStudent } from './service';
import { importPastedStudentsAction, archiveStudentAction, restoreStudentAction } from './actions';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const classId = randomUUID(), otherClassId = randomUUID();
let teacherId: string, teacherCookie: string, adminCookie: string;
async function login(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie }), body: { currentPassword: password, newPassword: 'ChangedPassword123!' } });
  return cookie;
}
beforeAll(async () => {
  const teacherEmail = randomUUID() + '@example.test', adminEmail = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: '名单老师', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  await auth.api.createUser({ body: { email: adminEmail, name: '名单管理员', password: 'AdminPassword123!', role: 'admin' } });
  teacherCookie = await login(teacherEmail, 'TeacherPassword123!');
  adminCookie = await login(adminEmail, 'AdminPassword123!');
  await db.insert(classes).values([{ id: classId, name: '导入班' }, { id: otherClassId, name: '其他班' }]);
  await db.insert(classTeachers).values({ classId, teacherId });
  activeCookie = teacherCookie;
});
afterAll(async () => { await pool.end(); });

test('same-class upsert preserves ID, leading zeroes and archived state', async () => {
  activeCookie = teacherCookie;
  expect(await importStudents(classId, [{ studentNumber: '001', name: '旧名', gender: null }])).toEqual({ inserted: 1, updated: 0 });
  const [original] = await listStudents(classId);
  await archiveStudent(classId, original.id);
  expect(await importStudents(classId, [
    { studentNumber: '001', name: '新名', gender: 'female' },
    { studentNumber: '002', name: '新增', gender: 'male' },
  ])).toEqual({ inserted: 1, updated: 1 });
  expect(await listStudents(classId)).toMatchObject([
    { id: original.id, studentNumber: '001', name: '新名', gender: 'female', archived: true },
    { studentNumber: '002', name: '新增', gender: 'male', archived: false },
  ]);
  await restoreStudent(classId, original.id);
  expect((await listStudents(classId))[0].archived).toBe(false);
});

test('identical numbers in different classes stay isolated and foreign writes fail', async () => {
  activeCookie = adminCookie;
  expect(await importStudents(otherClassId, [{ studentNumber: '001', name: '外班', gender: null }])).toEqual({ inserted: 1, updated: 0 });
  const [foreign] = await listStudents(otherClassId);
  activeCookie = teacherCookie;
  await expect(importStudents(otherClassId, [{ studentNumber: '001', name: '越权', gender: null }])).rejects.toThrow();
  await expect(archiveStudent(otherClassId, foreign.id)).rejects.toThrow();
  await expect(archiveStudent(classId, foreign.id)).rejects.toThrow();
  expect((await db.select().from(students).where(eq(students.id, foreign.id)))[0]).toMatchObject({ name: '外班', archived: false });
});

test('duplicate and invalid rows roll the entire batch back', async () => {
  activeCookie = teacherCookie;
  const before = await listStudents(classId);
  await expect(importStudents(classId, [
    { studentNumber: '001', name: '不应更新', gender: null },
    { studentNumber: '001', name: '重复', gender: 'male' },
  ])).rejects.toThrow();
  await expect(importStudents(classId, [
    { studentNumber: '001', name: '不应更新', gender: null },
    { studentNumber: '003', name: '无效性别', gender: 'other' as 'male' },
  ])).rejects.toThrow();
  expect(await listStudents(classId)).toEqual(before);
});

test('TSV confirmation ignores preview rows and removed teacher old session is refused', async () => {
  activeCookie = teacherCookie;
  const data = new FormData();
  data.set('classId', classId);
  data.set('text', '004\t有效\t女\n004\t重复\t男');
  data.set('rows', JSON.stringify([{ studentNumber: '005', name: '伪造预览', gender: null }]));
  const rejected = await importPastedStudentsAction(data);
  expect(rejected.ok).toBe(false);
  expect(rejected.errors).toContainEqual({ line: 2, message: expect.stringContaining('重复') });
  expect(await db.select().from(students).where(and(eq(students.classId, classId), eq(students.studentNumber, '004')))).toEqual([]);
  data.set('text', '004\t有效\t女');
  const confirmed = await importPastedStudentsAction(data);
  expect(confirmed, confirmed.message).toMatchObject({ ok: true, inserted: 1, updated: 0 });
  const roster = await listStudents(classId);
  expect(roster.some((row) => row.studentNumber === '005')).toBe(false);
  const archive = new FormData();
  archive.set('classId', classId);
  archive.set('studentId', String(roster.find((row) => row.studentNumber === '004')!.id));
  expect((await archiveStudentAction(archive)).ok).toBe(true);
  expect((await restoreStudentAction(archive)).ok).toBe(true);
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)));
  await expect(listStudents(classId)).rejects.toThrow();
  await expect(importStudents(classId, [{ studentNumber: '006', name: '禁止', gender: null }])).rejects.toThrow();
  await expect(importPastedStudentsAction(data)).rejects.toThrow();
  await expect(archiveStudentAction(archive)).rejects.toThrow();
  await expect(restoreStudentAction(archive)).rejects.toThrow();
  activeCookie = adminCookie;
  expect((await listStudents(classId)).some((row) => row.studentNumber === '006')).toBe(false);
});

async function holdClassRow(id: string) {
  let release!: () => void;
  let locked!: () => void;
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const transaction = db.transaction(async (tx) => {
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, id)).for('update');
    locked();
    await gate;
  });
  await acquired;
  return { release, transaction };
}

async function lockWaitOrOutcome(operation: Promise<unknown>): Promise<'blocked' | 'resolved' | 'rejected'> {
  let outcome: 'pending' | 'resolved' | 'rejected' = 'pending';
  void operation.then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (outcome !== 'pending') return outcome;
    const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid()
        AND datname = current_database() AND wait_event_type = 'Lock'
        AND (lower(query) LIKE '%classes%' OR lower(query) LIKE '%admin_audit%')
    ) AS blocked`);
    if (result.rows[0].blocked) return 'blocked';
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('写事务未进入班级行锁等待');
}

test.each(['import', 'archive', 'restore'] as const)('%s rejects a revoked teacher after an authorized old-session precheck', async (mode) => {
  activeCookie = teacherCookie;
  const id = randomUUID();
  await db.insert(classes).values({ id, name: '撤权竞态班' });
  await db.insert(classTeachers).values({ classId: id, teacherId });
  const [student] = await db.insert(students).values({ classId: id, studentNumber: '001', name: '未变', archived: mode === 'restore' })
    .returning({ id: students.id });
  const held = await holdClassRow(id);
  const operation = mode === 'import'
    ? importStudents(id, [{ studentNumber: '001', name: '越权更新', gender: null }])
    : mode === 'archive' ? archiveStudent(id, student.id) : restoreStudent(id, student.id);
  try {
    expect(await lockWaitOrOutcome(operation)).toBe('blocked');
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, teacherId)));
  } finally {
    held.release();
    await held.transaction;
  }
  await expect(operation).rejects.toThrow('无权访问班级');
  const [unchanged] = await db.select().from(students).where(eq(students.id, student.id));
  expect(unchanged).toMatchObject({ name: '未变', archived: mode === 'restore' });
});

test('removeTeacher waits on the class row lock before committing revocation', async () => {
  const id = randomUUID();
  await db.insert(classes).values({ id, name: '串行移除班' });
  await db.insert(classTeachers).values({ classId: id, teacherId });
  const held = await holdClassRow(id);
  activeCookie = adminCookie;
  const removal = removeTeacher(id, teacherId);
  let membershipUnlocked = false;
  try {
    expect(await lockWaitOrOutcome(removal)).toBe('blocked');
    membershipUnlocked = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '300ms'`);
      const member = await tx.select().from(classTeachers)
        .where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, teacherId))).for('share');
      return member.length === 1;
    }).catch(() => false);
  } finally {
    held.release();
    await held.transaction;
    await removal;
  }
  expect(membershipUnlocked).toBe(true);
  expect(await db.select().from(classTeachers).where(eq(classTeachers.classId, id))).toEqual([]);
}, 15000);

test('TSV action bounds errors from many short invalid lines without writing students', async () => {
  activeCookie = adminCookie;
  const id = randomUUID();
  await db.insert(classes).values({ id, name: '短行上限班' });
  const form = new FormData();
  form.set('classId', id);
  form.set('text', Array.from({ length: 12000 }, () => '\t\t未知\t多余').join('\n'));
  const result = await importPastedStudentsAction(form);
  expect(result.ok).toBe(false);
  expect(result.errors).toHaveLength(5000 * 4 + 1);
  expect(result.errors?.at(-1)).toEqual({ line: 5001, message: expect.stringContaining('5,000') });
  expect(await db.select().from(students).where(eq(students.classId, id))).toEqual([]);
});
