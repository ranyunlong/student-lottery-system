import { inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import { classes } from '../../../db/schema';

export async function withTeacherClassEmblems<T extends { id: string }>(items: readonly T[]) {
  if (!items.length) return items.map((item) => ({ ...item, emblemPath: null }));

  const emblems = await db.select({ id: classes.id, emblemPath: classes.emblemPath })
    .from(classes).where(inArray(classes.id, items.map((item) => item.id)));
  const emblemByClass = new Map(emblems.map((item) => [item.id, item.emblemPath]));
  return items.map((item) => ({ ...item, emblemPath: emblemByClass.get(item.id) ?? null }));
}
