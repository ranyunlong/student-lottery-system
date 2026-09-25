import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { user } from '../../db/auth-schema';
import { adminAudit, classes } from '../../db/schema';
import { auth } from '../../lib/auth';
import { createTeacher, createClass, assignTeacher, removeTeacher, listClassTeacherIds, archiveClass, updateClass, updateTeacher, disableTeacher, resetTeacherPassword, listTeachers, listClasses, listTeacherClasses, listAdminAudit } from './service';
import { createTeacherAction, createClassAction, assignTeacherAction, removeTeacherAction, archiveClassAction, updateClassAction, updateTeacherAction, disableTeacherAction, resetTeacherPasswordAction } from './actions';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
const adminEmail = `${randomUUID()}@example.test`;
const teacherEmail = `${randomUUID()}@example.test`;
let adminId: string;
let teacherId: string;
let teacherCookie: string;
let adminCookie: string;

async function cookieFor(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

beforeAll(async () => {
  adminId = (await auth.api.createUser({ body: { email: adminEmail, name: 'Admin', password: 'AdminPassword123!', role: 'admin' } })).user.id;
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: 'Teacher', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminCookie = await cookieFor(adminEmail, 'AdminPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: adminCookie }), body: { currentPassword: 'AdminPassword123!', newPassword: 'AdminChanged123!' } });
  teacherCookie = await cookieFor(teacherEmail, 'TeacherPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: teacherCookie }), body: { currentPassword: 'TeacherPassword123!', newPassword: 'TeacherChanged123!' } });
  activeCookie = adminCookie;
});
afterAll(async () => { await pool.end(); });

test('creates teachers and class, changes assignments and audits the authenticated actor', async () => {
  const email = `${randomUUID()}@example.test`;
  const a = await createTeacher({ name: '甲老师', email, temporaryPassword: 'TemporaryPassword123!' });
  const b = await createTeacher({ name: '乙老师', email: `${randomUUID()}@example.test`, temporaryPassword: 'TemporaryPassword123!' });
  const classId = await createClass('  一班  ');
  await assignTeacher(classId, a);
  await assignTeacher(classId, b);
  expect(await listClassTeacherIds(classId)).toEqual([a, b].sort());
  await removeTeacher(classId, a);
  expect(await listClassTeacherIds(classId)).toEqual([b]);
  expect((await db.select().from(user).where(eq(user.id, a)))[0]).toMatchObject({ email, role: 'user', mustChangePassword: true });
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].name).toBe('一班');
  const events = await db.select().from(adminAudit).where(eq(adminAudit.classId, classId)).orderBy(asc(adminAudit.createdAt));
  expect(events.map((e) => e.action)).toEqual(['class.create', 'class.teacher.assign', 'class.teacher.assign', 'class.teacher.remove']);
  expect(events.every((e) => e.actorId === adminId && e.createdAt instanceof Date)).toBe(true);
  const creation = (await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, a)))[0];
  expect(creation.actorId).toBe(adminId);
  expect(JSON.stringify(creation.details)).not.toContain('TemporaryPassword123!');
});

test('rejects blank names, duplicate email, administrator assignment and archived class assignment', async () => {
  await expect(createClass('  ')).rejects.toThrow();
  await expect(createTeacher({ name: '重复', email: teacherEmail, temporaryPassword: 'TemporaryPassword123!' })).rejects.toThrow();
  const classId = await createClass('归档班');
  await expect(assignTeacher(classId, adminId)).rejects.toThrow();
  await archiveClass(classId);
  await expect(assignTeacher(classId, teacherId)).rejects.toThrow();
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].archived).toBe(true);
  expect((await db.select().from(adminAudit).where(eq(adminAudit.classId, classId)).orderBy(asc(adminAudit.createdAt))).map((e) => e.action)).toEqual(['class.create', 'class.archive']);
});

test('updates, disables and resets teacher while retaining class history and audit', async () => {
  const id = await createTeacher({ name: '旧名', email: `${randomUUID()}@example.test`, temporaryPassword: 'TemporaryPassword123!' });
  const classId = await createClass('历史班');
  await assignTeacher(classId, id);
  await updateTeacher(id, { name: '新名', email: `${randomUUID()}@example.test` });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
  await resetTeacherPassword(id, 'ResetPassword123!');
  await disableTeacher(id);
  expect((await db.select().from(user).where(eq(user.id, id)))[0]).toMatchObject({ name: '新名', banned: true, mustChangePassword: true });
  expect(await listClassTeacherIds(classId)).toEqual([id]);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id)).orderBy(asc(adminAudit.createdAt));
  expect(events.map((e) => e.action)).toEqual(['teacher.create', 'class.teacher.assign', 'teacher.update', 'teacher.password.reset', 'teacher.disable']);
  expect(events.every((e) => e.actorId === adminId && e.createdAt instanceof Date)).toBe(true);
  expect(JSON.stringify(events)).not.toContain('ResetPassword123!');
});

test('teacher cannot call any administrator service or action including reads', async () => {
  activeCookie = teacherCookie;
  const data = (values: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };
  try {
    const denied = [
      () => createTeacher({ name: 'X', email: `${randomUUID()}@example.test`, temporaryPassword: 'Password123!' }),
      () => createClass('Forbidden'), () => assignTeacher(randomUUID(), teacherId),
      () => removeTeacher(randomUUID(), teacherId), () => listClassTeacherIds(randomUUID()),
      () => archiveClass(randomUUID()), () => updateTeacher(teacherId, { name: 'Changed', email: teacherEmail }),
      () => updateClass(randomUUID(), 'Changed'), () => listAdminAudit(),
      () => disableTeacher(teacherId), () => resetTeacherPassword(teacherId, 'ResetPassword123!'),
      () => listTeachers(), () => listClasses(),
      () => createTeacherAction(data({ name: 'X', email: `${randomUUID()}@example.test`, temporaryPassword: 'Password123!' })),
      () => createClassAction(data({ name: 'Forbidden' })),
      () => assignTeacherAction(data({ classId: randomUUID(), teacherId })),
      () => removeTeacherAction(data({ classId: randomUUID(), teacherId })),
      () => archiveClassAction(data({ classId: randomUUID() })),
      () => updateClassAction(data({ classId: randomUUID(), name: 'Changed' })),
      () => updateTeacherAction(data({ teacherId, name: 'X', email: teacherEmail })),
      () => disableTeacherAction(data({ teacherId })),
      () => resetTeacherPasswordAction(data({ teacherId, temporaryPassword: 'Password123!' })),
    ];
    for (const call of denied) await expect(call()).rejects.toThrow('需要管理员权限');
  } finally { activeCookie = adminCookie; }
  expect((await db.select().from(user).where(eq(user.id, teacherId)))[0]).toMatchObject({ name: 'Teacher', banned: false });
});

test('renames active class with actor audit and rejects edits after archival', async () => {
  const classId = await createClass('旧班名');
  await updateClass(classId, ' 新班名 ');
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].name).toBe('新班名');
  const event = (await listAdminAudit()).find((row) => row.classId === classId && row.action === 'class.update');
  expect(event).toMatchObject({ actorId: adminId, classId, details: { name: '新班名' } });
  await archiveClass(classId);
  await expect(updateClass(classId, '再修改')).rejects.toThrow();
});

test('teacher class list contains only active assigned classes', async () => {
  const assigned = await createClass('本班');
  const foreign = await createClass('其他班');
  const archived = await createClass('旧班');
  await assignTeacher(assigned, teacherId);
  await assignTeacher(archived, teacherId);
  await archiveClass(archived);
  activeCookie = teacherCookie;
  try {
    expect(await listTeacherClasses()).toEqual([{ id: assigned, name: '本班' }]);
  } finally { activeCookie = adminCookie; }
  expect(foreign).not.toBe(assigned);
});

test('administrator form action reports success or validation error with real database effects', async () => {
  const valid = new FormData();
  valid.set('name', '表单班');
  expect(await createClassAction(valid)).toEqual({ ok: true, message: '班级已创建' });
  expect((await listClasses()).some((row) => row.name === '表单班')).toBe(true);
  const invalid = new FormData();
  invalid.set('name', '   ');
  expect(await createClassAction(invalid)).toMatchObject({ ok: false });
});
