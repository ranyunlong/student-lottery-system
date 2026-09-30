// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { saveEmblem, validateEmblem } from './emblem';
import { GET, POST } from '../../app/api/classes/[classId]/emblem/route';
import { uploadEmblemAction } from './actions';

const state = vi.hoisted(() => ({ emblemPath: null as string | null, allowed: true, adminAllowed: true }));
vi.mock('../../db/client', () => {
  const fakeDb = {
    select: (fields: { id?: unknown; storageName?: unknown }) => ({ from: () => ({ where: () => ({
      for: async () => fields.storageName ? [] : [{ emblemPath: state.emblemPath }],
      limit: async () => fields.id ? [] : [{ emblemPath: state.emblemPath }],
    }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }),
    update: () => ({ set: (values: { emblemPath: string }) => ({ where: async () => {
      state.emblemPath = values.emblemPath;
    } }) }),
  };
  return { db: { ...fakeDb, transaction: (run: (tx: typeof fakeDb) => Promise<unknown>) => run(fakeDb) } };
});
vi.mock('../../lib/access', () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireClassAccess: async () => { if (!state.allowed) throw new ForbiddenError('forbidden'); },
    requireAdmin: async () => { if (!state.adminAllowed) throw new ForbiddenError('admin only'); return 'admin'; },
  };
});
vi.mock('./service', () => ({}));

let directory: string;
let png: Buffer;
let jpeg: Buffer;
let webp: Buffer;
const classId = randomUUID();
const context = { params: Promise.resolve({ classId }) };
const url = `http://localhost/api/classes/${classId}/emblem`;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'emblem-test-'));
  process.env.EMBLEM_DIR = directory;
  const image = sharp({ create: { width: 2, height: 2, channels: 3, background: '#d04020' } });
  png = await image.clone().png().toBuffer();
  jpeg = await image.clone().jpeg().toBuffer();
  webp = await image.clone().webp().toBuffer();
});
afterAll(async () => {
  delete process.env.EMBLEM_DIR;
  await rm(directory, { recursive: true, force: true });
});
beforeEach(() => { state.emblemPath = null; state.allowed = true; state.adminAllowed = true; });

function upload(bytes: Uint8Array, type: string, name = 'emblem.png') {
  const body = new FormData();
  body.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request(url, { method: 'POST', body }), context);
}

test('recognizes a PNG signature and rejects non-image content', () => {
  expect(validateEmblem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
  expect(() => validateEmblem(new TextEncoder().encode('<script>'))).toThrow('不支持的班徽格式');
});

test('recognizes JPEG and WebP signatures', () => {
  expect(validateEmblem(jpeg)).toBe('jpeg');
  expect(validateEmblem(webp)).toBe('webp');
});

test('rejects an image exceeding 2 MiB before storage', async () => {
  await expect(upload(new Uint8Array(2 * 1024 * 1024 + 1).fill(0x89), 'image/png')).resolves.toHaveProperty('status', 400);
  expect(state.emblemPath).toBeNull();
});

test('rejects truncated and spoofed images even with valid signatures', async () => {
  await expect(saveEmblem(classId, png.subarray(0, 8))).rejects.toThrow();
  await expect(saveEmblem(classId, Buffer.concat([png.subarray(0, 8), Buffer.from('<script>')]))).rejects.toThrow();
  await expect(saveEmblem(classId, jpeg.subarray(0, -2))).rejects.toThrow();
  expect(state.emblemPath).toBeNull();
});

test('writes a decoded image under a generated name independent of upload filename', async () => {
  const response = await upload(png, 'image/png', '../../outside.png');
  expect(response.status).toBe(200);
  expect(state.emblemPath).toMatch(/^[0-9a-f-]{36}\.png$/);
  expect(await readFile(join(directory, state.emblemPath!))).toEqual(png);
  const first = state.emblemPath;
  const second = await saveEmblem(classId, jpeg);
  expect(second).toMatch(/^[0-9a-f-]{36}\.jpeg$/);
  expect(second).not.toBe(first);
});

test('GET serves only an authorized class emblem with its actual content type', async () => {
  await saveEmblem(classId, webp);
  const response = await GET(new Request(url), context);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/webp');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(webp);
});

test('GET and upload deny teachers without class membership before reading or writing', async () => {
  await saveEmblem(classId, png);
  state.allowed = false;
  expect((await GET(new Request(url), context)).status).toBe(403);
  expect((await upload(jpeg, 'image/jpeg')).status).toBe(403);
  expect(state.emblemPath).toMatch(/\.png$/);
});

test('GET responds 404 for missing or unsafe stored paths', async () => {
  expect((await GET(new Request(url), context)).status).toBe(404);
  const outside = resolve(directory, '..', `outside-${randomUUID()}.png`);
  await writeFile(outside, png);
  try {
    state.emblemPath = `../${outside.split(/[\\/]/).at(-1)}`;
    expect((await GET(new Request(url), context)).status).toBe(404);
    state.emblemPath = `${randomUUID()}.png`;
    expect((await GET(new Request(url), context)).status).toBe(404);
  } finally { await rm(outside); }
});

test('upload rejects a MIME that disagrees with actual content and missing file', async () => {
  expect((await upload(jpeg, 'image/png')).status).toBe(400);
  expect((await upload(png, 'text/html')).status).toBe(400);
  expect((await POST(new Request(url, { method: 'POST', body: new FormData() }), context)).status).toBe(400);
  expect(state.emblemPath).toBeNull();
});

test('administrator action uploads an emblem and rejects invalid content', async () => {
  const form = new FormData();
  form.set('classId', classId);
  form.set('file', new File([new Uint8Array(png)], 'mark.png', { type: 'image/png' }));
  expect(await uploadEmblemAction(form)).toMatchObject({ ok: true });
  expect(state.emblemPath).toMatch(/\.png$/);
  form.set('file', new File([new Uint8Array(jpeg)], 'fake.png', { type: 'image/png' }));
  expect(await uploadEmblemAction(form)).toMatchObject({ ok: false });
});

test.each([undefined, '', '   '])('uploads and reads an emblem with the default directory when EMBLEM_DIR is %j', async (configuredDirectory) => {
  vi.stubEnv('EMBLEM_DIR', configuredDirectory);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  try {
    const form = new FormData();
    form.set('classId', classId);
    form.set('file', new File([new Uint8Array(png)], 'mark.png', { type: 'image/png' }));
    expect(await uploadEmblemAction(form)).toMatchObject({ ok: true });
    expect(await readFile(join(directory, 'data', 'emblems', state.emblemPath!))).toEqual(png);
    const response = await GET(new Request(url), context);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  } finally {
    cwd.mockRestore();
    vi.unstubAllEnvs();
  }
});

test('administrator action rejects a non-admin before storage', async () => {
  state.adminAllowed = false;
  const form = new FormData();
  form.set('classId', classId);
  form.set('file', new File([new Uint8Array(png)], 'mark.png', { type: 'image/png' }));
  await expect(uploadEmblemAction(form)).rejects.toThrow('admin only');
  expect(state.emblemPath).toBeNull();
});
