import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, redemptionAudit, winningRecords } from '../../db/schema';
import { ForbiddenError, requireAdmin, requireSession } from '../../lib/access';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WinningRecord = typeof winningRecords.$inferSelect & { redeemedByName: string | null };
const auditPageSize = 50;

async function adminReadAccess(tx: Transaction, actorId: string) {
  const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, actorId)).for('share');
  if (!identity || identity.banned || identity.mustChangePassword || identity.role !== 'admin') {
    throw new ForbiddenError('需要管理员权限');
  }
}

async function access(tx: Transaction, classId: string, actorId: string, write: boolean, adminOnly = false) {
  const [target] = await tx.select({ archived: classes.archived }).from(classes)
    .where(eq(classes.id, classId)).for(write ? 'update' : 'share');
  if (!target || (write && target.archived)) throw new ForbiddenError('班级不存在或已归档');
  const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, actorId)).for('share');
  if (!identity || identity.banned) throw new ForbiddenError('账号不可用');
  if (identity.mustChangePassword) throw new ForbiddenError('请先修改密码');
  if (adminOnly && identity.role !== 'admin') throw new ForbiddenError('需要管理员权限');
  if (identity.role === 'admin') return;
  if (identity.role !== 'user' || target.archived) throw new ForbiddenError();
  const [membership] = await tx.select({ classId: classTeachers.classId }).from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, actorId))).for('share');
  if (!membership) throw new ForbiddenError();
}

export async function listWinnings(classId: string, status?: 'pending' | 'redeemed'): Promise<WinningRecord[]> {
  const { userId } = await requireSession();
  if (status !== undefined && status !== 'pending' && status !== 'redeemed') throw new Error('兑换状态无效');
  return db.transaction(async (tx) => {
    await access(tx, classId, userId, false);
    return tx.select({ id: winningRecords.id, classId: winningRecords.classId, sessionId: winningRecords.sessionId,
      roundId: winningRecords.roundId, studentId: winningRecords.studentId,
      studentNumberSnapshot: winningRecords.studentNumberSnapshot, studentNameSnapshot: winningRecords.studentNameSnapshot,
      prizeId: winningRecords.prizeId, prizeNameSnapshot: winningRecords.prizeNameSnapshot,
      actorId: winningRecords.actorId, createdAt: winningRecords.createdAt,
      redemptionStatus: winningRecords.redemptionStatus, redeemedBy: winningRecords.redeemedBy,
      redeemedAt: winningRecords.redeemedAt, redeemedByName: user.name })
      .from(winningRecords).leftJoin(user, eq(user.id, winningRecords.redeemedBy))
      .where(status ? and(eq(winningRecords.classId, classId), eq(winningRecords.redemptionStatus, status)) : eq(winningRecords.classId, classId))
      .orderBy(desc(winningRecords.createdAt), desc(winningRecords.id));
  });
}

export async function redeemWin(classId: string, winId: string, actorId: string): Promise<void> {
  const { userId } = await requireSession();
  if (userId !== actorId) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    await access(tx, classId, userId, true);
    const [win] = await tx.select({ redemptionStatus: winningRecords.redemptionStatus }).from(winningRecords)
      .where(and(eq(winningRecords.classId, classId), eq(winningRecords.id, winId))).for('update');
    if (!win) throw new Error('中奖记录不存在');
    if (win.redemptionStatus !== 'pending') throw new Error('中奖记录已兑换');
    const [updated] = await tx.update(winningRecords).set({ redemptionStatus: 'redeemed', redeemedBy: userId, redeemedAt: new Date() })
      .where(and(eq(winningRecords.classId, classId), eq(winningRecords.id, winId), eq(winningRecords.redemptionStatus, 'pending')))
      .returning({ id: winningRecords.id });
    if (!updated) throw new Error('中奖记录已兑换');
    await tx.insert(redemptionAudit).values({ classId, winningRecordId: winId, actorId: userId,
      previousStatus: 'pending', newStatus: 'redeemed' });
  });
}

export async function correctRedemption(winId: string, reasonInput: string, adminId: string): Promise<void> {
  const current = await requireAdmin();
  if (current !== adminId) throw new ForbiddenError('需要管理员权限');
  const reason = reasonInput.trim();
  if (!reason) throw new Error('请填写纠错原因');
  const [located] = await db.select({ classId: winningRecords.classId }).from(winningRecords).where(eq(winningRecords.id, winId));
  if (!located) throw new Error('中奖记录不存在');
  await db.transaction(async (tx) => {
    await access(tx, located.classId, current, true, true);
    const [win] = await tx.select({ redemptionStatus: winningRecords.redemptionStatus }).from(winningRecords)
      .where(and(eq(winningRecords.classId, located.classId), eq(winningRecords.id, winId))).for('update');
    if (win?.redemptionStatus !== 'redeemed') throw new Error('中奖记录未兑换');
    await tx.insert(redemptionAudit).values({ classId: located.classId, winningRecordId: winId, actorId: current,
      previousStatus: 'redeemed', newStatus: 'pending', reason });
    const [updated] = await tx.update(winningRecords).set({ redemptionStatus: 'pending', redeemedBy: null, redeemedAt: null })
      .where(and(eq(winningRecords.classId, located.classId), eq(winningRecords.id, winId), eq(winningRecords.redemptionStatus, 'redeemed')))
      .returning({ id: winningRecords.id });
    if (!updated) throw new Error('中奖记录未兑换');
  });
}

export async function listRedemptionAudit(cursor?: string) {
  const adminId = await requireAdmin();
  return db.transaction(async (tx) => {
    await adminReadAccess(tx, adminId);
    let boundary: { id: string; createdAt: Date } | undefined;
    if (cursor !== undefined) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)) throw new Error('审计游标无效');
      [boundary] = await tx.select({ id: redemptionAudit.id, createdAt: redemptionAudit.createdAt })
        .from(redemptionAudit).where(eq(redemptionAudit.id, cursor));
      if (!boundary) throw new Error('审计游标无效');
    }
    const rows = await tx.select({ id: redemptionAudit.id, classId: redemptionAudit.classId,
    winningRecordId: redemptionAudit.winningRecordId, actorId: redemptionAudit.actorId,
    actorName: user.name, studentNumberSnapshot: winningRecords.studentNumberSnapshot,
    studentNameSnapshot: winningRecords.studentNameSnapshot, prizeNameSnapshot: winningRecords.prizeNameSnapshot,
    currentStatus: winningRecords.redemptionStatus,
    previousStatus: redemptionAudit.previousStatus, newStatus: redemptionAudit.newStatus,
    reason: redemptionAudit.reason, createdAt: redemptionAudit.createdAt })
    .from(redemptionAudit).innerJoin(winningRecords, eq(winningRecords.id, redemptionAudit.winningRecordId))
    .innerJoin(user, eq(user.id, redemptionAudit.actorId))
    .where(boundary ? or(lt(redemptionAudit.createdAt, boundary.createdAt),
      and(eq(redemptionAudit.createdAt, boundary.createdAt), lt(redemptionAudit.id, boundary.id))) : undefined)
    .orderBy(desc(redemptionAudit.createdAt), desc(redemptionAudit.id)).limit(auditPageSize + 1);
    const events = rows.slice(0, auditPageSize);
    return { events, nextCursor: rows.length > auditPageSize ? events.at(-1)!.id : null };
  });
}

export async function findRedeemedWinForCorrection(winId: string) {
  const adminId = await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(winId)) throw new Error('中奖记录编号无效');
  return db.transaction(async (tx) => {
    await adminReadAccess(tx, adminId);
    const [record] = await tx.select({ id: winningRecords.id, classId: winningRecords.classId,
      studentNumberSnapshot: winningRecords.studentNumberSnapshot, studentNameSnapshot: winningRecords.studentNameSnapshot,
      prizeNameSnapshot: winningRecords.prizeNameSnapshot, redeemedAt: winningRecords.redeemedAt })
      .from(winningRecords).where(and(eq(winningRecords.id, winId), eq(winningRecords.redemptionStatus, 'redeemed')));
    return record ?? null;
  });
}
