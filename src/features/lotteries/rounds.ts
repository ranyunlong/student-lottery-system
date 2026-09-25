import { randomInt, randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, lotteryRounds, lotterySessions, prizes, sessionPrizes, sessionStudents, stockEvents, students, winningRecords } from '../../db/schema';
import { checkClassAccess, ForbiddenError, requireSession } from '../../lib/access';
import { RetryableRoundError, UnavailableRoundError } from '../../lib/domain-errors';
import { pickUniformStudent, pickWeightedPrize } from './selection';
import type { DrawResult } from './types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentActor(actorId: string) {
  const { userId } = await requireSession();
  if (userId !== actorId) throw new ForbiddenError();
  return userId;
}

async function mutationAccess(tx: Transaction, classId: string, actorId: string) {
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

async function locateSession(sessionId: string) {
  const [session] = await db.select({ classId: lotterySessions.classId }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
  if (!session) throw new UnavailableRoundError('场次不存在');
  return session.classId;
}

async function locateToken(token: string) {
  const [round] = await db.select({ classId: lotteryRounds.classId, sessionId: lotteryRounds.sessionId })
    .from(lotteryRounds).where(eq(lotteryRounds.startToken, token));
  if (!round) throw new UnavailableRoundError('轮次不存在');
  return round;
}

async function lockedSession(tx: Transaction, sessionId: string, classId: string) {
  const [session] = await tx.select().from(lotterySessions)
    .where(and(eq(lotterySessions.id, sessionId), eq(lotterySessions.classId, classId))).for('update');
  if (!session || session.status !== 'active') throw new UnavailableRoundError('只有进行中的场次可以操作轮次');
  return session;
}

async function lockedPrizes(tx: Transaction, classId: string, ids: string[]) {
  const rows = [];
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx.select().from(prizes)
      .where(and(eq(prizes.classId, classId), eq(prizes.id, id))).for('update');
    if (row) rows.push(row);
  }
  return rows;
}

async function studentCandidate(tx: Transaction, classId: string, sessionId: string, studentId: number) {
  const [candidate] = await tx.select({ usedCount: sessionStudents.usedCount, name: students.name,
    number: students.studentNumber, archived: students.archived })
    .from(sessionStudents).innerJoin(students, and(eq(students.id, sessionStudents.studentId), eq(students.classId, classId)))
    .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, studentId)));
  if (!candidate || candidate.archived) throw new UnavailableRoundError('候选学生不存在或已归档');
  return candidate;
}

function result(record: typeof winningRecords.$inferSelect): DrawResult {
  return { winId: record.id, studentId: record.studentId, studentName: record.studentNameSnapshot,
    prizeId: record.prizeId, prizeName: record.prizeNameSnapshot };
}

function sqlCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as { code?: string; cause?: unknown };
  return value.code ?? sqlCode(value.cause);
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!['40001', '40P01'].includes(sqlCode(error) ?? '')) throw error;
      if (attempt === 2) throw new RetryableRoundError();
    }
  }
  throw new RetryableRoundError();
}

export async function startRound(sessionId: string, actorId: string, selectedStudentId?: number): Promise<{ roundId: string; token: string }> {
  const current = await currentActor(actorId);
  const classId = await locateSession(sessionId);
  await checkClassAccess(current, classId);
  return withRetry(() => db.transaction(async (tx) => {
    await mutationAccess(tx, classId, current);
    const session = await lockedSession(tx, sessionId, classId);
    const [running] = await tx.select({ id: lotteryRounds.id, startToken: lotteryRounds.startToken, studentId: lotteryRounds.studentId }).from(lotteryRounds)
      .where(and(eq(lotteryRounds.sessionId, sessionId), eq(lotteryRounds.status, 'active'))).limit(1);
    if (running) {
      if (running.studentId === (selectedStudentId ?? null)) return { roundId: running.id, token: running.startToken };
      throw new UnavailableRoundError('请先完成或取消进行中的轮次');
    }
    if (session.mode === 'student_prize') {
      if (!Number.isSafeInteger(selectedStudentId) || !selectedStudentId || selectedStudentId <= 0) throw new UnavailableRoundError('请选择候选学生');
      const candidate = await studentCandidate(tx, classId, sessionId, selectedStudentId);
      if (candidate.usedCount >= session.studentDrawLimit!) throw new UnavailableRoundError('学生已达到抽取次数上限');
      const options = await tx.select().from(sessionPrizes).where(eq(sessionPrizes.sessionId, sessionId)).orderBy(asc(sessionPrizes.prizeId));
      const inventory = await lockedPrizes(tx, classId, options.map((row) => row.prizeId));
      if (!options.some((item) => item.quantityLimit > item.usedCount
        && inventory.some((prize) => prize.id === item.prizeId && !prize.archived && prize.stock > 0))) throw new UnavailableRoundError('没有可抽取的奖品');
    } else {
      if (selectedStudentId !== undefined) throw new UnavailableRoundError('此模式不能指定学生');
      const candidates = await tx.select({ id: sessionStudents.studentId, archived: students.archived })
        .from(sessionStudents).innerJoin(students, eq(students.id, sessionStudents.studentId))
        .where(eq(sessionStudents.sessionId, sessionId));
      const winners = await tx.select({ studentId: winningRecords.studentId }).from(winningRecords).where(eq(winningRecords.sessionId, sessionId));
      const won = new Set(winners.map((item) => item.studentId));
      const [prize] = await lockedPrizes(tx, classId, [session.fixedPrizeId!]);
      if (winners.length >= session.roundLimit! || !candidates.some((item) => !item.archived && !won.has(item.id))
        || !prize || prize.archived || prize.stock <= 0) throw new UnavailableRoundError('抽取轮数、候选学生或库存已耗尽');
    }
    const token = randomUUID();
    const [created] = await tx.insert(lotteryRounds).values({ classId, sessionId, startToken: token,
      studentId: session.mode === 'student_prize' ? selectedStudentId : null, startedBy: current }).returning({ id: lotteryRounds.id });
    return { roundId: created.id, token };
  }));
}

export async function stopRound(token: string, actorId: string): Promise<DrawResult> {
  const current = await currentActor(actorId);
  const located = await locateToken(token);
  await checkClassAccess(current, located.classId);
  return withRetry(() => db.transaction(async (tx) => {
    await mutationAccess(tx, located.classId, current);
    const [session] = await tx.select().from(lotterySessions)
      .where(and(eq(lotterySessions.id, located.sessionId), eq(lotterySessions.classId, located.classId))).for('update');
    if (!session) throw new UnavailableRoundError('场次不存在');
    const [round] = await tx.select().from(lotteryRounds).where(eq(lotteryRounds.startToken, token)).for('update');
    if (!round || round.sessionId !== session.id || round.classId !== located.classId) throw new UnavailableRoundError('轮次不存在');
    if (round.status === 'completed') {
      const [record] = await tx.select().from(winningRecords).where(eq(winningRecords.roundId, round.id));
      if (!record) throw new UnavailableRoundError('中奖记录不存在');
      return result(record);
    }
    if (session.status !== 'active' || round.status !== 'active') throw new UnavailableRoundError('轮次已取消或场次已结束');

    let studentId: number;
    let prizeId: string;
    if (session.mode === 'student_prize') {
      if (!round.studentId) throw new UnavailableRoundError('轮次未指定学生');
      const candidate = await studentCandidate(tx, located.classId, session.id, round.studentId);
      if (candidate.usedCount >= session.studentDrawLimit!) throw new UnavailableRoundError('学生已达到抽取次数上限');
      const options = await tx.select().from(sessionPrizes).where(eq(sessionPrizes.sessionId, session.id)).orderBy(asc(sessionPrizes.prizeId));
      const inventory = await lockedPrizes(tx, located.classId, options.map((item) => item.prizeId));
      prizeId = pickWeightedPrize(options.map((item) => {
        const prize = inventory.find((row) => row.id === item.prizeId);
        return { prizeId: item.prizeId, quotaRemaining: item.quantityLimit - item.usedCount,
          stockRemaining: prize && !prize.archived ? prize.stock : 0 };
      }), randomInt);
      studentId = round.studentId;
    } else {
      const [prize] = await lockedPrizes(tx, located.classId, [session.fixedPrizeId!]);
      if (!prize || prize.archived || prize.stock <= 0) throw new UnavailableRoundError('库存不足或奖品已归档');
      const winners = await tx.select({ studentId: winningRecords.studentId }).from(winningRecords).where(eq(winningRecords.sessionId, session.id));
      if (winners.length >= session.roundLimit!) throw new UnavailableRoundError('本场轮数已用尽');
      const won = new Set(winners.map((item) => item.studentId));
      const candidates = await tx.select({ id: sessionStudents.studentId, archived: students.archived })
        .from(sessionStudents).innerJoin(students, eq(students.id, sessionStudents.studentId))
        .where(eq(sessionStudents.sessionId, session.id)).orderBy(asc(sessionStudents.studentId));
      studentId = pickUniformStudent(candidates.filter((item) => !item.archived && !won.has(item.id)).map((item) => item.id), randomInt);
      prizeId = prize.id;
    }

    const candidate = await studentCandidate(tx, located.classId, session.id, studentId);
    const [prize] = await tx.select().from(prizes).where(eq(prizes.id, prizeId));
    if (!prize || prize.archived || prize.stock < 1) throw new UnavailableRoundError('库存不足或奖品已归档');
    const [record] = await tx.insert(winningRecords).values({ classId: located.classId, sessionId: session.id, roundId: round.id,
      studentId, studentNumberSnapshot: candidate.number, studentNameSnapshot: candidate.name,
      prizeId, prizeNameSnapshot: prize.name, actorId: current }).returning();
    const [deducted] = await tx.update(prizes).set({ stock: sql`${prizes.stock} - 1` })
      .where(and(eq(prizes.id, prizeId), sql`${prizes.stock} > 0`, eq(prizes.archived, false))).returning({ id: prizes.id });
    if (!deducted) throw new UnavailableRoundError('库存不足或奖品已归档');
    await tx.insert(stockEvents).values({ classId: located.classId, prizeId, delta: -1, reason: '抽奖中奖', actorId: current, winningRecordId: record.id });
    await tx.update(sessionStudents).set({ usedCount: sql`${sessionStudents.usedCount} + 1` })
      .where(and(eq(sessionStudents.sessionId, session.id), eq(sessionStudents.studentId, studentId)));
    if (session.mode === 'student_prize') await tx.update(sessionPrizes).set({ usedCount: sql`${sessionPrizes.usedCount} + 1` })
      .where(and(eq(sessionPrizes.sessionId, session.id), eq(sessionPrizes.prizeId, prizeId)));
    await tx.update(lotteryRounds).set({ status: 'completed', stopToken: token, stoppedBy: current, stoppedAt: new Date() })
      .where(eq(lotteryRounds.id, round.id));
    return result(record);
  }));
}

export async function cancelRound(token: string, actorId: string): Promise<void> {
  const current = await currentActor(actorId);
  const located = await locateToken(token);
  await checkClassAccess(current, located.classId);
  await withRetry(() => db.transaction(async (tx) => {
    await mutationAccess(tx, located.classId, current);
    const [session] = await tx.select({ status: lotterySessions.status }).from(lotterySessions)
      .where(eq(lotterySessions.id, located.sessionId)).for('update');
    const [round] = await tx.select().from(lotteryRounds).where(eq(lotteryRounds.startToken, token)).for('update');
    if (!round || round.classId !== located.classId || round.sessionId !== located.sessionId) throw new UnavailableRoundError('轮次不存在');
    if (round.status === 'cancelled') return;
    if (session?.status !== 'active' || round.status !== 'active') throw new UnavailableRoundError('轮次已完成或场次已结束');
    await tx.update(lotteryRounds).set({ status: 'cancelled' }).where(eq(lotteryRounds.id, round.id));
  }));
}
