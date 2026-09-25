import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../../db/client';
import { classes } from '../../db/schema';

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
  if (!process.env.EMBLEM_DIR) throw new Error('EMBLEM_DIR is required');
  return resolve(process.env.EMBLEM_DIR);
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
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), bytes, { flag: 'wx' });
  try {
    const updated = await db.update(classes).set({ emblemPath: name })
      .where(eq(classes.id, classId)).returning({ id: classes.id });
    if (!updated.length) throw new Error('班级不存在');
  } catch (error) {
    await unlink(join(directory, name));
    throw error;
  }
  return name;
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
  const [target] = await db.select({ emblemPath: classes.emblemPath }).from(classes)
    .where(eq(classes.id, classId)).limit(1);
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
}
