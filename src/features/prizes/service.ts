import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, prizes, stockEvents } from '../../db/schema';
import { ForbiddenError, requireClassAccess, requireSession } from '../../lib/access';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StockEvent = { prizeId: string; delta: number; reason: string; actorId: string; createdAt: Date };

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
    actorId: stockEvents.actorId, createdAt: stockEvents.createdAt })
    .from(stockEvents).where(eq(stockEvents.prizeId, prizeId))
    .orderBy(asc(stockEvents.createdAt), asc(stockEvents.id));
}

export async function listPrizes(classId: string): Promise<(typeof prizes.$inferSelect)[]> {
  await requireClassAccess(classId);
  return db.select().from(prizes).where(eq(prizes.classId, classId))
    .orderBy(asc(prizes.archived), asc(prizes.name), asc(prizes.id));
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
