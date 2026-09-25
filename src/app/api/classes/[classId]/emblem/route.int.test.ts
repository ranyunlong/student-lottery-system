import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import sharp from 'sharp';
import { db, pool } from '../../../../../db/client';
import { classes, classTeachers } from '../../../../../db/schema';
import { auth } from '../../../../../lib/auth';
import { GET, POST } from './route';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));

const classId = randomUUID();
const foreignId = randomUUID();
const url = (id: string) => `http://localhost/api/classes/${id}/emblem`;
const context = (id: string) => ({ params: Promise.resolve({ classId: id }) });
let adminCookie: string;
let teacherCookie: string;
let teacherId: string;
let directory: string;
let originalDirectory: string | undefined;
let png: Buffer;

async function cookieFor(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

function upload(id: string, type: string) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(png)], 'logo.png', { type }));
  return POST(new Request(url(id), { method: 'POST', body: form }), context(id));
}

beforeAll(async () => {
  originalDirectory = process.env.EMBLEM_DIR;
  directory = await mkdtemp(join(tmpdir(), 'emblem-int-'));
  process.env.EMBLEM_DIR = directory;
  const adminEmail = `${randomUUID()}@example.test`;
  const teacherEmail = `${randomUUID()}@example.test`;
  await auth.api.createUser({ body: { email: adminEmail, name: 'Emblem Admin', password: 'AdminPassword123!', role: 'admin' } });
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: 'Emblem Teacher', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminCookie = await cookieFor(adminEmail, 'AdminPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: adminCookie }), body: { currentPassword: 'AdminPassword123!', newPassword: 'AdminChanged123!' } });
  teacherCookie = await cookieFor(teacherEmail, 'TeacherPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: teacherCookie }), body: { currentPassword: 'TeacherPassword123!', newPassword: 'TeacherChanged123!' } });
  await db.insert(classes).values([{ id: classId, name: 'Emblem class' }, { id: foreignId, name: 'Foreign class' }]);
  await db.insert(classTeachers).values({ classId, teacherId });
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#009977' } }).png().toBuffer();
});

afterAll(async () => {
  if (originalDirectory === undefined) delete process.env.EMBLEM_DIR;
  else process.env.EMBLEM_DIR = originalDirectory;
  await rm(directory, { recursive: true, force: true });
  await pool.end();
});

test('real class membership grants upload and GET, but denies a foreign class', async () => {
  activeCookie = adminCookie;
  expect((await GET(new Request(url(foreignId)), context(foreignId))).status).toBe(404);
  expect((await upload(classId, 'image/png')).status).toBe(200);
  activeCookie = teacherCookie;
  const image = await GET(new Request(url(classId)), context(classId));
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  expect((await GET(new Request(url(foreignId)), context(foreignId))).status).toBe(403);
  expect((await upload(foreignId, 'image/png')).status).toBe(403);
});

test('real upload rejects mismatched MIME and malformed class identifiers', async () => {
  activeCookie = adminCookie;
  expect((await upload(classId, 'image/jpeg')).status).toBe(400);
  expect((await GET(new Request(url('..')), context('..'))).status).toBe(400);
});
