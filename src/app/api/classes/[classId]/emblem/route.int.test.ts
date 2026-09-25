import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import sharp from 'sharp';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../../../../../db/client';
import { classes, classTeachers, emblemCleanup } from '../../../../../db/schema';
import { runEmblemCleanupBatch, saveEmblem } from '../../../../../features/classes/emblem';
import { auth } from '../../../../../lib/auth';
import { GET, POST } from './route';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
const readGate = vi.hoisted(() => ({ wait: null as Promise<void> | null, entered: null as (() => void) | null }));
const cleanupFaults = vi.hoisted(() => ({
  unlinkName: null as string | null,
  backlogNames: new Set<string>(),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, readFile: async (...args: Parameters<typeof real.readFile>) => {
    if (readGate.wait) {
      readGate.entered?.();
      await readGate.wait;
    }
    return real.readFile(...args);
  }, unlink: async (...args: Parameters<typeof real.unlink>) => {
    if ((cleanupFaults.unlinkName && String(args[0]).endsWith(cleanupFaults.unlinkName))
      || cleanupFaults.backlogNames.has(String(args[0]).split(/[\\/]/).at(-1)!)) {
      throw Object.assign(new Error('injected emblem unlink failure'), { code: 'EACCES' });
    }
    return real.unlink(...args);
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
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, original.emblemPath!)))
    .toHaveLength(1);
  const sharedImage = await GET(new Request(url(foreignId)), context(foreignId));
  expect(sharedImage.status).toBe(200);
  expect(Buffer.from(await sharedImage.arrayBuffer())).toEqual(jpeg);
  expect((await upload(foreignId, 'image/png')).status).toBe(200);
  const refs = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(inArray(classes.id, [classId, foreignId]));
  expect((await readdir(directory)).sort()).toEqual(refs.map((row) => row.emblemPath).filter(Boolean).sort());
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, original.emblemPath!)))
    .toHaveLength(0);
});

test('concurrent replacements drain a pending shared file without losing current emblems', async () => {
  activeCookie = adminCookie;
  const [old] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const [foreignBefore] = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(eq(classes.id, foreignId));
  await db.update(classes).set({ emblemPath: old.emblemPath }).where(eq(classes.id, foreignId));
  if (foreignBefore.emblemPath) {
    await db.insert(emblemCleanup).values({ storageName: foreignBefore.emblemPath }).onConflictDoNothing();
  }
  expect((await upload(classId, 'image/png')).status).toBe(200);
  const results = await Promise.all([upload(classId, 'image/png'), upload(foreignId, 'image/png')]);
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  const refs = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(inArray(classes.id, [classId, foreignId]));
  expect((await readdir(directory)).sort()).toEqual(
    [foreignBefore.emblemPath, ...refs.map((row) => row.emblemPath)].sort(),
  );
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!)))
    .toHaveLength(0);
  expect((await runEmblemCleanupBatch()).failed).toBe(0);
  expect((await readdir(directory)).sort()).toEqual(refs.map((row) => row.emblemPath).sort());
});

test('post-commit cleanup transaction failure does not report a committed upload as failed', async () => {
  activeCookie = adminCookie;
  const [old] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const originalTransaction = db.transaction.bind(db);
  let transactions = 0;
  const spy = vi.spyOn(db, 'transaction').mockImplementation((callback, config) => {
    if (++transactions === 2) throw new Error('injected cleanup transaction failure');
    return originalTransaction(callback, config);
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let response: Response;
  try {
    response = await upload(classId, 'image/png');
    expect(log).toHaveBeenCalledWith(expect.stringContaining(old.emblemPath!), expect.any(Error));
  }
  finally { spy.mockRestore(); log.mockRestore(); }
  expect(response.status).toBe(200);
  const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  expect(current.emblemPath).toBe((await response.json()).name);
  expect(await readdir(directory)).toContain(old.emblemPath);
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!)))
    .toHaveLength(1);
  expect((await upload(classId, 'image/png')).status).toBe(200);
  expect(await readdir(directory)).toContain(old.emblemPath);
  expect((await runEmblemCleanupBatch()).failed).toBe(0);
  expect(await readdir(directory)).not.toContain(old.emblemPath);
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!)))
    .toHaveLength(0);
});

test('post-commit unlink failure does not report a committed upload as failed', async () => {
  activeCookie = adminCookie;
  const [old] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  cleanupFaults.unlinkName = old.emblemPath;
  let response: Response;
  try { response = await upload(classId, 'image/png'); } finally { cleanupFaults.unlinkName = null; }
  expect(response.status).toBe(200);
  const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  expect(current.emblemPath).toBe((await response.json()).name);
  expect(await readdir(directory)).toContain(old.emblemPath);
  const [pending] = await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!));
  expect(pending).toMatchObject({ attempts: 1, lastError: expect.stringContaining('injected emblem unlink failure') });
  expect((await upload(classId, 'image/png')).status).toBe(200);
  expect(await readdir(directory)).toContain(old.emblemPath);
  expect((await runEmblemCleanupBatch()).failed).toBe(0);
  expect(await readdir(directory)).not.toContain(old.emblemPath);
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!)))
    .toHaveLength(0);
});

test('persistent cleanup failures remain visible and retries preserve the current file', async () => {
  activeCookie = adminCookie;
  const [old] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanupFaults.unlinkName = old.emblemPath;
  try {
    expect((await upload(classId, 'image/png')).status).toBe(200);
    expect((await upload(classId, 'image/png')).status).toBe(200);
    expect((await runEmblemCleanupBatch(1)).failed).toBe(1);
    const [pending] = await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!));
    expect(pending.attempts).toBe(2);
    expect(pending.lastError).toContain('injected emblem unlink failure');
    expect(log).toHaveBeenCalledWith(expect.stringContaining(old.emblemPath!), expect.any(Error));
    const refs = await db.select({ emblemPath: classes.emblemPath }).from(classes)
      .where(inArray(classes.id, [classId, foreignId]));
    expect((await readdir(directory)).sort()).toEqual(
      [old.emblemPath, ...refs.map((row) => row.emblemPath)].sort(),
    );
    const image = await GET(new Request(url(classId)), context(classId));
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  } finally {
    cleanupFaults.unlinkName = null;
    log.mockRestore();
  }
  expect((await runEmblemCleanupBatch()).failed).toBe(0);
  expect((await upload(classId, 'image/png')).status).toBe(200);
  expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, old.emblemPath!)))
    .toHaveLength(0);
  const refs = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(inArray(classes.id, [classId, foreignId]));
  expect((await readdir(directory)).sort()).toEqual(refs.map((row) => row.emblemPath).sort());
});

test('retry does not remove a pending file referenced by another class during its GET', async () => {
  activeCookie = adminCookie;
  const [old] = await db.select({ emblemPath: classes.emblemPath }).from(classes).where(eq(classes.id, classId));
  cleanupFaults.unlinkName = old.emblemPath;
  try { expect((await upload(classId, 'image/png')).status).toBe(200); }
  finally { cleanupFaults.unlinkName = null; }
  await db.update(classes).set({ emblemPath: old.emblemPath }).where(eq(classes.id, foreignId));
  const entered = new Promise<void>((resolve) => { readGate.entered = resolve; });
  let release!: () => void;
  readGate.wait = new Promise<void>((resolve) => { release = resolve; });
  let reading: Promise<Response> | undefined;
  let replacing: Promise<Response> | undefined;
  try {
    reading = GET(new Request(url(foreignId)), context(foreignId));
    await entered;
    replacing = upload(foreignId, 'image/png');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await readdir(directory)).toContain(old.emblemPath);
    release();
    readGate.wait = null;
    expect(Buffer.from(await (await reading).arrayBuffer())).toEqual(png);
    expect((await replacing).status).toBe(200);
    expect(await readdir(directory)).not.toContain(old.emblemPath);
  } finally {
    readGate.wait = null;
    readGate.entered = null;
    release();
    await Promise.allSettled([reading, replacing]);
  }
});

test('upload does not scan or retry a large unrelated cleanup backlog', async () => {
  activeCookie = adminCookie;
  const names = Array.from({ length: 160 }, () => `${randomUUID()}.png`);
  await db.insert(emblemCleanup).values(names.map((storageName) => ({ storageName })));
  names.forEach((name) => cleanupFaults.backlogNames.add(name));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await upload(classId, 'image/png');
    expect(response.status).toBe(200);
    const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes)
      .where(eq(classes.id, classId));
    expect((await response.json()).name).toBe(current.emblemPath);
    const pending = await db.select({ attempts: emblemCleanup.attempts }).from(emblemCleanup)
      .where(inArray(emblemCleanup.storageName, names));
    expect(pending).toHaveLength(160);
    expect(pending.every((task) => task.attempts === 0)).toBe(true);
  } finally {
    cleanupFaults.backlogNames.clear();
    log.mockRestore();
    await db.delete(emblemCleanup).where(inArray(emblemCleanup.storageName, names));
  }
});

test('standalone cleanup command drains a bounded batch per invocation', async () => {
  const names = Array.from({ length: 5 }, () => `${randomUUID()}.png`);
  await db.insert(emblemCleanup).values(names.map((storageName) => ({ storageName })));
  await Promise.all(names.map((name) => writeFile(join(directory, name), png)));
  const run = () => JSON.parse(execFileSync(process.execPath, [
    'node_modules/tsx/dist/cli.mjs', 'scripts/retry-emblem-cleanup.ts', '--limit', '2',
  ], { cwd: process.cwd(), env: { ...process.env, EMBLEM_DIR: directory }, encoding: 'utf8' })) as {
    attempted: number; failed: number; hasMore: boolean;
  };
  try {
    expect(run()).toEqual({ attempted: 2, failed: 0, hasMore: true });
    expect(await db.select().from(emblemCleanup).where(inArray(emblemCleanup.storageName, names)))
      .toHaveLength(3);
    expect(run()).toEqual({ attempted: 2, failed: 0, hasMore: true });
    expect(run()).toEqual({ attempted: 1, failed: 0, hasMore: false });
    expect(await db.select().from(emblemCleanup).where(inArray(emblemCleanup.storageName, names)))
      .toHaveLength(0);
    expect((await readdir(directory)).some((name) => names.includes(name))).toBe(false);
  } finally {
    await db.delete(emblemCleanup).where(inArray(emblemCleanup.storageName, names));
    await Promise.all(names.map((name) => rm(join(directory, name), { force: true })));
  }
});

test('batch skips referenced files and processes an eligible file within its limit', async () => {
  const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(eq(classes.id, foreignId));
  const eligible = `${randomUUID()}.png`;
  await db.insert(emblemCleanup).values([
    { storageName: current.emblemPath! }, { storageName: eligible },
  ]).onConflictDoNothing();
  await writeFile(join(directory, eligible), png);
  try {
    expect(await runEmblemCleanupBatch(1)).toEqual({ attempted: 1, failed: 0, hasMore: false });
    expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, eligible)))
      .toHaveLength(0);
    expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, current.emblemPath!)))
      .toHaveLength(1);
    const image = await GET(new Request(url(foreignId)), context(foreignId));
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  } finally {
    await db.delete(emblemCleanup).where(inArray(emblemCleanup.storageName, [current.emblemPath!, eligible]));
    await rm(join(directory, eligible), { force: true });
  }
});

test('failed batch item does not starve later cleanup tasks', async () => {
  const names = [`${randomUUID()}.png`, `${randomUUID()}.png`].sort();
  await db.insert(emblemCleanup).values(names.map((storageName) => ({ storageName })));
  await Promise.all(names.map((name) => writeFile(join(directory, name), png)));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanupFaults.backlogNames.add(names[0]);
  try {
    expect(await runEmblemCleanupBatch(1)).toEqual({ attempted: 1, failed: 1, hasMore: true });
    expect(await runEmblemCleanupBatch(1)).toEqual({ attempted: 1, failed: 0, hasMore: true });
    expect(await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, names[1])))
      .toHaveLength(0);
    const [failed] = await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, names[0]));
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain('injected emblem unlink failure');
  } finally {
    cleanupFaults.backlogNames.clear();
    log.mockRestore();
    await runEmblemCleanupBatch(2);
    await db.delete(emblemCleanup).where(inArray(emblemCleanup.storageName, names));
    await Promise.all(names.map((name) => rm(join(directory, name), { force: true })));
  }
});

test('standalone cleanup command exposes failures without following unsafe paths', async () => {
  const unsafe = `../${randomUUID()}.png`;
  await db.insert(emblemCleanup).values({ storageName: unsafe });
  const [current] = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(eq(classes.id, classId));
  try {
    const result = spawnSync(process.execPath, [
      'node_modules/tsx/dist/cli.mjs', 'scripts/retry-emblem-cleanup.ts', '--limit', '1',
    ], { cwd: process.cwd(), env: { ...process.env, EMBLEM_DIR: directory }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ attempted: 1, failed: 1, hasMore: false });
    expect(result.stderr).toContain('Invalid emblem cleanup filename');
    const [pending] = await db.select().from(emblemCleanup).where(eq(emblemCleanup.storageName, unsafe));
    expect(pending).toMatchObject({ attempts: 1, lastError: expect.stringContaining('Invalid emblem cleanup filename') });
    const image = await GET(new Request(url(classId)), context(classId));
    expect(image.status).toBe(200);
    expect(await readdir(directory)).toContain(current.emblemPath);
  } finally {
    await db.delete(emblemCleanup).where(eq(emblemCleanup.storageName, unsafe));
  }
});

test('standalone cleanup command rejects an unbounded batch size', () => {
  const result = spawnSync(process.execPath, [
    'node_modules/tsx/dist/cli.mjs', 'scripts/retry-emblem-cleanup.ts', '--limit', '101',
  ], { cwd: process.cwd(), env: { ...process.env, EMBLEM_DIR: directory }, encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Cleanup batch limit must be between 1 and 100');
});
