import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import sharp from 'sharp';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../../../../../db/client';
import { classes, classTeachers } from '../../../../../db/schema';
import { saveEmblem } from '../../../../../features/classes/emblem';
import { auth } from '../../../../../lib/auth';
import { GET, POST } from './route';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
const readGate = vi.hoisted(() => ({ wait: null as Promise<void> | null, entered: null as (() => void) | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, readFile: async (...args: Parameters<typeof real.readFile>) => {
    if (readGate.wait) {
      readGate.entered?.();
      await readGate.wait;
    }
    return real.readFile(...args);
  } };
});

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
let jpeg: Buffer;

async function cookieFor(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

function upload(id: string, type: string, bytes: Uint8Array = png) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'logo.png', { type }));
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
  jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#dd3311' } }).jpeg().toBuffer();
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

test('repeated replacements leave only the current random file', async () => {
  activeCookie = adminCookie;
  for (let i = 0; i < 24; i++) {
    expect((await upload(classId, 'image/png')).status).toBe(200);
    const [row] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
    expect(await readdir(directory)).toEqual([row.emblemPath]);
  }
});

test('concurrent uploads preserve only the final referenced file', async () => {
  activeCookie = adminCookie;
  const [first, second] = await Promise.all([upload(classId, 'image/png'), upload(classId, 'image/png')]);
  expect([first.status, second.status]).toEqual([200, 200]);
  expect((await first.json()).name).not.toBe((await second.json()).name);
  const [row] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  expect(await readdir(directory)).toEqual([row.emblemPath]);
});

test('replacement waits until a GET has finished reading its old file', async () => {
  const [previous] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const entered = new Promise<void>((resolve) => { readGate.entered = resolve; });
  let release!: () => void;
  readGate.wait = new Promise<void>((resolve) => { release = resolve; });
  let reading: Promise<Response> | undefined;
  let replacing: Promise<Response> | undefined;
  try {
    activeCookie = teacherCookie;
    reading = GET(new Request(url(classId)), context(classId));
    await entered;
    activeCookie = adminCookie;
    let settled = false;
    replacing = upload(classId, 'image/jpeg', jpeg).then((response) => { settled = true; return response; });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(settled).toBe(false);
    expect(await readdir(directory)).toEqual([previous.emblemPath]);
    release();
    readGate.wait = null;
    const oldImage = await reading;
    expect(oldImage.status).toBe(200);
    expect((await replacing).status).toBe(200);
    expect(Buffer.from(await oldImage.arrayBuffer())).toEqual(png);
    const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
    expect(current.emblemPath).not.toBe(previous.emblemPath);
    expect(await readdir(directory)).toEqual([current.emblemPath]);
    const newImage = await GET(new Request(url(classId)), context(classId));
    expect(newImage.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await newImage.arrayBuffer())).toEqual(jpeg);
  } finally {
    readGate.wait = null;
    readGate.entered = null;
    release();
    await Promise.allSettled([reading, replacing]);
  }
});

test('failed database update removes the new file and leaves the current reference intact', async () => {
  const [before] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const filesBefore = await readdir(directory);
  await expect(saveEmblem(randomUUID(), png)).rejects.toThrow('班级不存在');
  const [after] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  expect(after.emblemPath).toBe(before.emblemPath);
  expect(await readdir(directory)).toEqual(filesBefore);
});

test('database failure after writing a file rolls back the reference and removes that file', async () => {
  const [before] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const filesBefore = await readdir(directory);
  await db.execute(sql.raw(`CREATE FUNCTION task5_reject_emblem_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected emblem update failure'; END; $$`));
  await db.execute(sql.raw(`CREATE TRIGGER task5_reject_emblem_update BEFORE UPDATE OF emblem_path
    ON classes FOR EACH ROW EXECUTE FUNCTION task5_reject_emblem_update()`));
  try {
    await expect(saveEmblem(classId, png)).rejects.toMatchObject({
      cause: { message: expect.stringContaining('injected emblem update failure') },
    });
    const [after] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
    expect(after.emblemPath).toBe(before.emblemPath);
    expect(await readdir(directory)).toEqual(filesBefore);
  } finally {
    await db.execute(sql.raw('DROP TRIGGER task5_reject_emblem_update ON classes'));
    await db.execute(sql.raw('DROP FUNCTION task5_reject_emblem_update()'));
  }
});

test('cleanup preserves an old file while another class still references it', async () => {
  activeCookie = adminCookie;
  const [original] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  await db.update(classes).set({ emblemPath: original.emblemPath }).where(eq(classes.id, foreignId));
  expect((await upload(classId, 'image/png')).status).toBe(200);
  expect(await readdir(directory)).toContain(original.emblemPath);
  const sharedImage = await GET(new Request(url(foreignId)), context(foreignId));
  expect(sharedImage.status).toBe(200);
  expect(Buffer.from(await sharedImage.arrayBuffer())).toEqual(jpeg);
  expect((await upload(foreignId, 'image/png')).status).toBe(200);
  const refs = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(inArray(classes.id, [classId, foreignId]));
  expect((await readdir(directory)).sort()).toEqual(refs.map((row) => row.emblemPath).filter(Boolean).sort());
});
