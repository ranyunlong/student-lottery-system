import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../../../../../db/client';
import { classes, classTeachers, students } from '../../../../../../db/schema';
import { auth } from '../../../../../../lib/auth';
import { POST } from './route';

let cookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie }) }));
const classId = randomUUID(), foreignId = randomUUID();
const context = (id: string) => ({ params: Promise.resolve({ classId: id }) });
const url = (id: string) => 'http://localhost/api/classes/' + id + '/students/import';
let teacherId: string, teacherCookie: string, adminCookie: string, bytes: Uint8Array;
async function signIn(email: string, password: string) {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const value = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie: value }), body: { currentPassword: password, newPassword: 'ChangedPassword123!' } });
  return value;
}
function upload(id: string, file: Uint8Array, intent: string, rows?: string) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(file)], 'students.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  form.set('intent', intent);
  if (rows) form.set('rows', rows);
  return POST(new Request(url(id), { method: 'POST', headers: { origin: 'http://localhost' }, body: form }), context(id));
}
beforeAll(async () => {
  const teacherEmail = randomUUID() + '@example.test', adminEmail = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: '上传老师', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  await auth.api.createUser({ body: { email: adminEmail, name: '上传管理员', password: 'AdminPassword123!', role: 'admin' } });
  teacherCookie = await signIn(teacherEmail, 'TeacherPassword123!');
  adminCookie = await signIn(adminEmail, 'AdminPassword123!');
  await db.insert(classes).values([{ id: classId, name: '上传班' }, { id: foreignId, name: '外班' }]);
  await db.insert(classTeachers).values({ classId, teacherId });
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('学生');
  sheet.addRow(['学号', '姓名', '性别']);
  sheet.addRow(['0001', '小明', '男']);
  bytes = new Uint8Array(await book.xlsx.writeBuffer());
  cookie = teacherCookie;
});
afterAll(async () => { await pool.end(); });

test('preview does not write and confirmation reparses the XLSX rather than client rows', async () => {
  cookie = teacherCookie;
  const preview = await upload(classId, bytes, 'preview');
  expect(preview.status).toBe(200);
  expect((await preview.json()).rows).toMatchObject([{ studentNumber: '0001', name: '小明' }]);
  expect(await db.select().from(students).where(eq(students.classId, classId))).toEqual([]);
  const confirmed = await upload(classId, bytes, 'confirm', JSON.stringify([{ studentNumber: 'hijack', name: '伪造' }]));
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toMatchObject({ inserted: 1, updated: 0 });
  expect(await db.select().from(students).where(eq(students.classId, classId))).toMatchObject([{ studentNumber: '0001', name: '小明' }]);
});

test('invalid workbook refuses the whole batch even if a valid row precedes an error', async () => {
  cookie = teacherCookie;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('学生');
  sheet.addRow(['学号', '姓名', '性别']);
  sheet.addRow(['0001', '新姓名', '女']);
  sheet.addRow(['0002', '', '女']);
  const res = await upload(classId, new Uint8Array(await book.xlsx.writeBuffer()), 'confirm');
  expect(res.status).toBe(422);
  expect((await res.json()).errors).toContainEqual({ line: 3, message: expect.stringContaining('姓名') });
  expect(await db.select().from(students).where(eq(students.classId, classId))).toMatchObject([{ studentNumber: '0001', name: '小明' }]);
});

test('file limit accepts the exact 5 MiB boundary for parsing and rejects one byte above it', async () => {
  cookie = teacherCookie;
  const exact = await upload(classId, new Uint8Array(5 * 1024 * 1024), 'preview');
  expect(exact.status).toBe(422);
  expect((await exact.json()).errors).not.toContainEqual({ line: 0, message: expect.stringContaining('5 MiB') });
  const over = await upload(classId, new Uint8Array(5 * 1024 * 1024 + 1), 'confirm');
  expect(over.status).toBe(413);
  expect(await db.select().from(students).where(eq(students.classId, classId))).toHaveLength(1);
});

test('foreign class and revoked old session fail before upload can change students', async () => {
  cookie = teacherCookie;
  expect((await upload(foreignId, bytes, 'confirm')).status).toBe(403);
  await db.delete(classTeachers).where(eq(classTeachers.teacherId, teacherId));
  expect((await upload(classId, bytes, 'confirm')).status).toBe(403);
  cookie = adminCookie;
  expect((await upload(foreignId, bytes, 'preview')).status).toBe(200);
});

test('cross-origin and missing-origin uploads are refused before parsing', async () => {
  cookie = adminCookie;
  const form = new FormData();
  form.set('intent', 'confirm');
  form.set('file', new File([new Uint8Array(bytes)], 'students.xlsx'));
  const external = new Request(url(classId), { method: 'POST', headers: { origin: 'https://foreign.example' }, body: form });
  expect((await POST(external, context(classId))).status).toBe(403);
  expect((await POST(new Request(url(classId), { method: 'POST', body: form }), context(classId))).status).toBe(403);
});
