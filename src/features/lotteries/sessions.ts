import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, lotteryRounds, lotterySessions, prizes, sessionPrizes, sessionStudents, students } from '../../db/schema';
import { ForbiddenError, requireClassAccess, requireSession } from '../../lib/access';
import type { SessionConfig, SessionView } from './types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const positive = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

async function mutationAccess(tx: Transaction, classId: string, actorId: string) {
  const [target] = await tx.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).for('update');
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

function validateShape(config: SessionConfig) {
  if (!config || !['student-prize', 'prize-student'].includes(config.mode)
    || !Array.isArray(config.studentIds) || !config.studentIds.length
    || config.studentIds.some((id) => !positive(id)) || new Set(config.studentIds).size !== config.studentIds.length) {
    throw new Error('候选学生不能为空、重复或无效');
  }
  if (config.mode === 'student-prize') {
    if (!positive(config.perStudentLimit)) throw new Error('每人抽取次数必须是正整数');
    if (!Array.isArray(config.prizes) || !config.prizes.length || config.prizes.some((item) => !item || !item.prizeId || !positive(item.quantity))
      || new Set(config.prizes.map((item) => item.prizeId)).size !== config.prizes.length) throw new Error('候选奖品及数量无效或重复');
  } else if (!config.prizeId || !positive(config.roundCount)) throw new Error('奖品和抽取轮数必须有效');
}

async function validateCandidates(tx: Transaction, classId: string, config: SessionConfig) {
  validateShape(config);
  const roster = await tx.select({ id: students.id, archived: students.archived }).from(students)
    .where(and(eq(students.classId, classId), inArray(students.id, config.studentIds)));
  if (roster.length !== config.studentIds.length) throw new Error('候选数据不属于班级');
  if (roster.some((item) => item.archived)) throw new Error('候选学生已归档');
  const prizeIds = config.mode === 'student-prize' ? config.prizes.map((item) => item.prizeId) : [config.prizeId];
  const available = await tx.select({ id: prizes.id, archived: prizes.archived, stock: prizes.stock }).from(prizes)
    .where(and(eq(prizes.classId, classId), inArray(prizes.id, prizeIds)));
  if (available.length !== prizeIds.length) throw new Error('候选数据不属于班级');
  if (available.some((item) => item.archived)) throw new Error('候选奖品已归档');
  if (config.mode === 'student-prize') {
    if (config.prizes.some((item) => item.quantity > available.find((row) => row.id === item.prizeId)!.stock)) throw new Error('库存不足');
  } else {
    if (config.roundCount > config.studentIds.length) throw new Error('抽取轮数超过候选人数');
    if (config.roundCount > available[0].stock) throw new Error('库存不足');
  }
}

async function persist(tx: Transaction, id: string, classId: string, config: SessionConfig) {
  await tx.update(lotterySessions).set({ mode: config.mode === 'student-prize' ? 'student_prize' : 'prize_student',
    studentDrawLimit: config.mode === 'student-prize' ? config.perStudentLimit : null,
    fixedPrizeId: config.mode === 'prize-student' ? config.prizeId : null,
    roundLimit: config.mode === 'prize-student' ? config.roundCount : null }).where(eq(lotterySessions.id, id));
  await tx.delete(sessionPrizes).where(eq(sessionPrizes.sessionId, id));
  await tx.delete(sessionStudents).where(eq(sessionStudents.sessionId, id));
  await tx.insert(sessionStudents).values(config.studentIds.map((studentId) => ({ classId, sessionId: id, studentId })));
  if (config.mode === 'student-prize') await tx.insert(sessionPrizes).values(config.prizes.map((item) => ({ classId, sessionId: id, prizeId: item.prizeId, quantityLimit: item.quantity })));
}

async function locate(sessionId: string) {
  const [row] = await db.select({ classId: lotterySessions.classId }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
  if (!row) throw new Error('场次不存在');
  return row.classId;
}

export async function createSession(classId: string, config: SessionConfig): Promise<string> {
  const { userId } = await requireSession();
  return db.transaction(async (tx) => {
    await mutationAccess(tx, classId, userId);
    await validateCandidates(tx, classId, config);
    const [row] = await tx.insert(lotterySessions).values({ classId, mode: config.mode === 'student-prize' ? 'student_prize' : 'prize_student', createdBy: userId }).returning({ id: lotterySessions.id });
    await persist(tx, row.id, classId, config);
    return row.id;
  });
}

export async function updateDraftSession(sessionId: string, config: SessionConfig): Promise<void> {
  const { userId } = await requireSession();
  const classId = await locate(sessionId);
  await db.transaction(async (tx) => {
    await mutationAccess(tx, classId, userId);
    const [row] = await tx.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)).for('update');
    if (row?.status !== 'draft') throw new Error('只有草稿场次可以修改');
    await validateCandidates(tx, classId, config);
    await persist(tx, sessionId, classId, config);
  });
}

async function readConfig(tx: Transaction, sessionId: string, row: typeof lotterySessions.$inferSelect): Promise<SessionConfig> {
  const candidates = await tx.select({ studentId: sessionStudents.studentId }).from(sessionStudents)
    .where(eq(sessionStudents.sessionId, sessionId)).orderBy(asc(sessionStudents.studentId));
  const studentIds = candidates.map((item) => item.studentId);
  if (row.mode === 'prize_student') return { mode: 'prize-student', studentIds, prizeId: row.fixedPrizeId!, roundCount: row.roundLimit! };
  const options = await tx.select({ prizeId: sessionPrizes.prizeId, quantity: sessionPrizes.quantityLimit }).from(sessionPrizes)
    .where(eq(sessionPrizes.sessionId, sessionId)).orderBy(asc(sessionPrizes.prizeId));
  return { mode: 'student-prize', studentIds, prizes: options, perStudentLimit: row.studentDrawLimit! };
}

export async function activateSession(sessionId: string): Promise<void> {
  const { userId } = await requireSession();
  const classId = await locate(sessionId);
  await db.transaction(async (tx) => {
    await mutationAccess(tx, classId, userId);
    const [row] = await tx.select().from(lotterySessions).where(eq(lotterySessions.id, sessionId)).for('update');
    if (row?.status !== 'draft') throw new Error('只有草稿场次可以激活');
    await validateCandidates(tx, classId, await readConfig(tx, sessionId, row));
    await tx.update(lotterySessions).set({ status: 'active', startedAt: new Date() }).where(eq(lotterySessions.id, sessionId));
  });
}

export async function completeSession(sessionId: string): Promise<void> {
  const { userId } = await requireSession();
  const classId = await locate(sessionId);
  await db.transaction(async (tx) => {
    await mutationAccess(tx, classId, userId);
    const [row] = await tx.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)).for('update');
    if (row?.status !== 'active') throw new Error('只有进行中的场次可以结束');
    const [running] = await tx.select({ id: lotteryRounds.id }).from(lotteryRounds)
      .where(and(eq(lotteryRounds.sessionId, sessionId), eq(lotteryRounds.status, 'active'))).limit(1);
    if (running) throw new Error('请先完成或取消进行中的轮次');
    await tx.update(lotterySessions).set({ status: 'completed', completedAt: new Date() }).where(eq(lotterySessions.id, sessionId));
  });
}

export async function getSession(sessionId: string): Promise<SessionView> {
  const classId = await locate(sessionId);
  await requireClassAccess(classId);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(lotterySessions).where(eq(lotterySessions.id, sessionId));
    if (!row) throw new Error('场次不存在');
    return { ...await readConfig(tx, sessionId, row), id: row.id, classId, status: row.status as SessionView['status'],
      createdAt: row.createdAt, startedAt: row.startedAt, completedAt: row.completedAt };
  });
}

export async function listSessions(classId: string): Promise<SessionView[]> {
  await requireClassAccess(classId);
  const rows = await db.select({ id: lotterySessions.id }).from(lotterySessions).where(eq(lotterySessions.classId, classId))
    .orderBy(asc(lotterySessions.createdAt), asc(lotterySessions.id));
  return Promise.all(rows.map((row) => getSession(row.id)));
}

export async function requireActiveSession(sessionId: string): Promise<SessionView> {
  const session = await getSession(sessionId);
  if (session.status !== 'active') throw new Error('只有进行中的场次可以开始轮次');
  return session;
}
