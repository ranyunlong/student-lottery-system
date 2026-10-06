import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, prizes, stockEvents } from '../../db/schema';
import { ForbiddenError, requireClassAccess, requireSession } from '../../lib/access';
import type { PrizeImportRow } from './excel';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StockEvent = { prizeId: string; delta: number; reason: string; actorId: string; actorName: string; createdAt: Date };
export type PrizeSortField = 'name' | 'createdAt';
export type PrizeSortOrder = 'asc' | 'desc';
export type ListPrizesOptions = { search?: string; sort?: PrizeSortField; order?: PrizeSortOrder };

async function requireMutationAccess(tx: Transaction, classId: string, actorId: string): Promise<void> {
  const [target] = await tx.select({ archived: classes.archived }).from(classes)
    .where(eq(classes.id, classId)).for('update');
  if (!target || target.archived) throw new ForbiddenError('班级不存在或已归档');
  const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, actorId)).for('share');
  if (!identity || identity.banned) throw new ForbiddenError('账号不可用');
  if (identity.mustChangePassword) throw new ForbiddenError('请先修改密码');
  if (identity.role === 'admin') return;
  if (identity.role !== 'user') throw new ForbiddenError();
  const [membership] = await tx.select({ classId: classTeachers.classId }).from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, actorId))).for('share');
  if (!membership) throw new ForbiddenError();
}

function quantity(value: number, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value > 2147483647 || value < -2147483647 || (!allowZero && value === 0)) {
    throw new Error('库存数量必须是有效整数');
  }
}

export async function createPrize(classId: string, nameInput: string, openingStock: number, actorId: string): Promise<string> {
  const { userId } = await requireSession();
  if (userId !== actorId) throw new ForbiddenError();
  const name = nameInput.trim();
  if (!name) throw new Error('奖品名称不能为空');
  quantity(openingStock, true);
  if (openingStock < 0) throw new Error('库存不足');
  return db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
    const [created] = await tx.insert(prizes).values({ classId, name, stock: openingStock })
      .returning({ id: prizes.id });
    await tx.insert(stockEvents).values({ classId, prizeId: created.id, delta: openingStock,
      reason: '初始库存', actorId: userId });
    return created.id;
  });
}

export async function adjustStock(classId: string, prizeId: string, delta: number, reasonInput: string, actorId: string): Promise<number> {
  const { userId } = await requireSession();
  if (userId !== actorId) throw new ForbiddenError();
  quantity(delta, false);
  const reason = reasonInput.trim();
  if (!reason) throw new Error('请填写调整原因');
  return db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
    const [updated] = await tx.update(prizes).set({ stock: sql`${prizes.stock} + ${delta}` })
      .where(and(eq(prizes.classId, classId), eq(prizes.id, prizeId), eq(prizes.archived, false),
        sql`${prizes.stock} + ${delta} >= 0`, sql`${prizes.stock} + ${delta} <= 2147483647`))
      .returning({ stock: prizes.stock });
    if (!updated) {
      const [existing] = await tx.select({ stock: prizes.stock }).from(prizes)
        .where(and(eq(prizes.classId, classId), eq(prizes.id, prizeId), eq(prizes.archived, false)));
      if (!existing) throw new Error('奖品不存在或已归档');
      throw new Error(delta < 0 ? '库存不足' : '库存数量超出范围');
    }
    await tx.insert(stockEvents).values({ classId, prizeId, delta, reason, actorId: userId });
    return updated.stock;
  });
}

export async function importPrizes(classId: string, rows: PrizeImportRow[]): Promise<{ inserted: number; updated: number }> {
  const { userId } = await requireSession();
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('请输入 1 至 500 种奖品');
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name !== row.name.trim()
      || row.name.length > 200 || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 2147483647
      || seen.has(row.name)) throw new Error('奖品导入数据无效');
    seen.add(row.name);
  }
  return db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
    const existing = await tx.select({ id: prizes.id, name: prizes.name }).from(prizes)
      .where(and(eq(prizes.classId, classId), eq(prizes.archived, false), inArray(prizes.name, rows.map((row) => row.name))));
    const byName = new Map(existing.map((item) => [item.name, item.id]));
    let inserted = 0;
    for (const row of rows) {
      let prizeId = byName.get(row.name);
      if (prizeId) {
        const [updated] = await tx.update(prizes).set({ stock: sql`${prizes.stock} + ${row.quantity}` })
          .where(and(eq(prizes.id, prizeId), sql`${prizes.stock} + ${row.quantity} <= 2147483647`))
          .returning({ id: prizes.id });
        if (!updated) throw new Error(`“${row.name}”库存数量超出范围`);
      } else {
        const [created] = await tx.insert(prizes).values({ classId, name: row.name, stock: row.quantity }).returning({ id: prizes.id });
        prizeId = created.id;
        inserted++;
      }
      await tx.insert(stockEvents).values({ classId, prizeId, delta: row.quantity,
        reason: 'Excel 导入补充库存', actorId: userId });
    }
    return { inserted, updated: rows.length - inserted };
  });
}

async function accessiblePrize(prizeId: string) {
  const [prize] = await db.select({ id: prizes.id, classId: prizes.classId, stock: prizes.stock })
    .from(prizes).where(eq(prizes.id, prizeId)).limit(1);
  if (!prize) throw new Error('奖品不存在');
  await requireClassAccess(prize.classId);
  return prize;
}

export async function getPrizeStock(prizeId: string): Promise<number> {
  return (await accessiblePrize(prizeId)).stock;
}

export async function listStockEvents(prizeId: string): Promise<StockEvent[]> {
  await accessiblePrize(prizeId);
  return db.select({ prizeId: stockEvents.prizeId, delta: stockEvents.delta, reason: stockEvents.reason,
    actorId: stockEvents.actorId, actorName: user.name, createdAt: stockEvents.createdAt })
    .from(stockEvents).innerJoin(user, eq(stockEvents.actorId, user.id)).where(eq(stockEvents.prizeId, prizeId))
    .orderBy(asc(stockEvents.createdAt), asc(stockEvents.id));
}

function prizeNamePattern(value: string) {
  return `${value.trim().toLocaleLowerCase().replace(/[!%_]/g, (character) => `!${character}`)}%`;
}

export async function listPrizes(classId: string, options: ListPrizesOptions = {}): Promise<(typeof prizes.$inferSelect)[]> {
  await requireClassAccess(classId);
  const conditions = [eq(prizes.classId, classId)];
  const search = options.search?.trim();
  if (search) conditions.push(sql`lower(${prizes.name}) LIKE ${prizeNamePattern(search)} ESCAPE '!'`);
  const direction = options.order === 'desc' ? desc : asc;
  const sortField = options.sort === 'name' ? prizes.name : prizes.createdAt;
  return db.select().from(prizes).where(and(...conditions))
    .orderBy(asc(prizes.archived), direction(sortField), direction(prizes.id));
}

export async function archivePrize(classId: string, prizeId: string): Promise<void> {
  const { userId } = await requireSession();
  await db.transaction(async (tx) => {
    await requireMutationAccess(tx, classId, userId);
    const archived = await tx.update(prizes).set({ archived: true })
      .where(and(eq(prizes.classId, classId), eq(prizes.id, prizeId), eq(prizes.archived, false)))
      .returning({ id: prizes.id });
    if (!archived.length) throw new Error('奖品不存在或已归档');
  });
}
