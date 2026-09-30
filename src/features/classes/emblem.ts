import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { eq, notExists, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../../db/client';
import { classes, emblemCleanup } from '../../db/schema';

export type EmblemFormat = 'png' | 'jpeg' | 'webp';
export const EMBLEM_MIME: Record<EmblemFormat, string> = {
  png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp',
};
const namePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpeg|webp)$/;

export class InvalidEmblemError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidEmblemError'; }
}

export function validateEmblem(bytes: Uint8Array): EmblemFormat {
  if (bytes.byteLength > 2 * 1024 * 1024) throw new InvalidEmblemError('班徽不能超过 2 MiB');
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'webp';
  throw new InvalidEmblemError('不支持的班徽格式');
}

function emblemDirectory(): string {
  return resolve(process.env.EMBLEM_DIR?.trim() || 'data/emblems');
}

export async function saveEmblem(classId: string, bytes: Uint8Array): Promise<string> {
  const format = validateEmblem(bytes);
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== format) throw new Error('format mismatch');
    await image.raw().toBuffer();
  } catch {
    throw new InvalidEmblemError('班徽文件损坏或格式不匹配');
  }
  const directory = emblemDirectory();
  const name = `${randomUUID()}.${format}`;
  const path = join(directory, name);
  await mkdir(directory, { recursive: true });
  let created = false;
  let previous: string | null;
  try {
    previous = await db.transaction(async (tx) => {
      const [target] = await tx.select({ emblemPath: classes.emblemPath }).from(classes)
        .where(eq(classes.id, classId)).for('update');
      if (!target) throw new Error('班级不存在');
      const handle = await open(path, 'wx');
      created = true;
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
      await tx.update(classes).set({ emblemPath: name }).where(eq(classes.id, classId));
      if (target.emblemPath && namePattern.test(target.emblemPath)) {
        await tx.insert(emblemCleanup).values({ storageName: target.emblemPath }).onConflictDoNothing();
      }
      return target.emblemPath;
    });
  } catch (error) {
    if (created) await unlink(path);
    throw error;
  }
  if (previous && namePattern.test(previous)) await retryEmblemCleanup(previous, directory);
  return name;
}

async function retryEmblemCleanup(storageName: string, directory: string): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      const [task] = await tx.select({ storageName: emblemCleanup.storageName }).from(emblemCleanup)
        .where(eq(emblemCleanup.storageName, storageName)).for('update');
      if (!task) return;
      if (!namePattern.test(storageName)) throw new Error('Invalid emblem cleanup filename');
      // Uploads only introduce fresh names. A GET of the old name must finish
      // before the last replacement commits, because GET holds a shared row lock.
      // Do not lock referenced rows here: replacement locks them before queuing
      // cleanup, so the reverse lock order would deadlock concurrent uploads.
      const [referenced] = await tx.select({ id: classes.id }).from(classes)
        .where(eq(classes.emblemPath, storageName)).limit(1);
      if (referenced) return;
      try {
        await unlink(join(directory, storageName));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await tx.delete(emblemCleanup).where(eq(emblemCleanup.storageName, storageName));
    });
    return false;
  } catch (error) {
    console.error(`Emblem cleanup failed for ${storageName}; pending record retained`, error);
    try {
      await db.update(emblemCleanup).set({
        attempts: sql`${emblemCleanup.attempts} + 1`,
        lastError: String(error),
      }).where(eq(emblemCleanup.storageName, storageName));
    } catch (recordError) {
      console.error(`Emblem cleanup failure recording failed for ${storageName}`, recordError);
    }
    return true;
  }
}

export async function runEmblemCleanupBatch(limit = 50): Promise<{
  attempted: number; failed: number; hasMore: boolean;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Cleanup batch limit must be between 1 and 100');
  }
  const directory = emblemDirectory();
  const pending = await db.select({ storageName: emblemCleanup.storageName }).from(emblemCleanup)
    .where(notExists(db.select({ id: classes.id }).from(classes)
      .where(eq(classes.emblemPath, emblemCleanup.storageName))))
    .orderBy(emblemCleanup.attempts, emblemCleanup.createdAt, emblemCleanup.storageName)
    .limit(limit + 1);
  let failed = 0;
  for (const { storageName } of pending.slice(0, limit)) {
    if (await retryEmblemCleanup(storageName, directory)) failed++;
  }
  return { attempted: Math.min(pending.length, limit), failed, hasMore: pending.length > limit };
}

export async function saveUploadedEmblem(classId: string, file: FormDataEntryValue | null): Promise<string> {
  if (!(file instanceof File)) throw new InvalidEmblemError('请选择班徽文件');
  if (file.size > 2 * 1024 * 1024) throw new InvalidEmblemError('班徽不能超过 2 MiB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = validateEmblem(bytes);
  if (file.type !== EMBLEM_MIME[format]) throw new InvalidEmblemError('班徽 MIME 类型与文件内容不符');
  return saveEmblem(classId, bytes);
}

export async function loadEmblem(classId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  // Hold a shared row lock until the old file is fully in memory; replacements need an exclusive lock.
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ emblemPath: classes.emblemPath }).from(classes)
      .where(eq(classes.id, classId)).for('share');
    const name = target?.emblemPath;
    if (!name || !namePattern.test(name)) return null;
    const format = name.split('.').at(-1) as EmblemFormat;
    try {
      const bytes = await readFile(join(emblemDirectory(), name));
      return { bytes, mime: EMBLEM_MIME[format] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  });
}
