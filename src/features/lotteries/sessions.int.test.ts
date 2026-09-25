import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, lotteryRounds, lotterySessions, prizes, sessionPrizes, sessionStudents, students } from '../../db/schema';
import { auth } from '../../lib/auth';
import { removeTeacher } from '../classes/service';
import { activateSession, completeSession, createSession, getSession, listSessions, requireActiveSession, updateDraftSession } from './sessions';
import { activateSessionAction, saveSessionAction } from './actions';

let cookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const classId = randomUUID(), otherClassId = randomUUID();
let teacherId: string, adminId: string, teacherCookie: string, adminCookie: string;
let a: number, b: number, foreign: number, prizeId: string, foreignPrize: string;
async function login(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const value = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie: value }), body: { currentPassword: password, newPassword: 'ChangedPassword123!' } });
  return value;
}
beforeAll(async () => {
  const email = randomUUID() + '@example.test', adminEmail = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email, name: '场次老师', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminId = (await auth.api.createUser({ body: { email: adminEmail, name: '管理员', password: 'AdminPassword123!', role: 'admin' } })).user.id;
  teacherCookie = await login(email, 'TeacherPassword123!');
  adminCookie = await login(adminEmail, 'AdminPassword123!');
  await db.insert(classes).values([{ id: classId, name: '抽奖班' }, { id: otherClassId, name: '外班' }]);
  await db.insert(classTeachers).values({ classId, teacherId });
  [{ id: a }, { id: b }] = await db.insert(students).values([{ classId, studentNumber: '001', name: '甲' }, { classId, studentNumber: '002', name: '乙' }]).returning({ id: students.id });
  [{ id: foreign }] = await db.insert(students).values({ classId: otherClassId, studentNumber: '001', name: '外班' }).returning({ id: students.id });
  [{ id: prizeId }] = await db.insert(prizes).values({ classId, name: '奖品', stock: 3 }).returning({ id: prizes.id });
  [{ id: foreignPrize }] = await db.insert(prizes).values({ classId: otherClassId, name: '外班奖', stock: 3 }).returning({ id: prizes.id });
  cookie = teacherCookie;
});
afterAll(async () => { await pool.end(); });

test('mode two bounds rounds by candidates and shared stock', async () => {
  await expect(createSession(classId, { mode: 'prize-student', studentIds: [a, b], prizeId, roundCount: 3 })).rejects.toThrow('抽取轮数超过候选人数');
  await db.update(prizes).set({ stock: 1 }).where(eq(prizes.id, prizeId));
  await expect(createSession(classId, { mode: 'prize-student', studentIds: [a, b], prizeId, roundCount: 2 })).rejects.toThrow('库存不足');
  await db.update(prizes).set({ stock: 3 }).where(eq(prizes.id, prizeId));
});

test('foreign, archived, empty and duplicate candidates are rejected', async () => {
  const base = { mode: 'student-prize' as const, studentIds: [a], prizes: [{ prizeId, quantity: 1 }], perStudentLimit: 1 };
  await expect(createSession(classId, { ...base, studentIds: [foreign] })).rejects.toThrow('候选数据不属于班级');
  await expect(createSession(classId, { ...base, prizes: [{ prizeId: foreignPrize, quantity: 1 }] })).rejects.toThrow('候选数据不属于班级');
  await expect(createSession(classId, { ...base, studentIds: [] })).rejects.toThrow();
  await expect(createSession(classId, { ...base, studentIds: [a, a] })).rejects.toThrow();
  await expect(createSession(classId, { ...base, prizes: [] })).rejects.toThrow();
  await expect(createSession(classId, { ...base, prizes: [base.prizes[0], base.prizes[0]] })).rejects.toThrow();
  await expect(createSession(classId, { ...base, perStudentLimit: 0 })).rejects.toThrow();
  await expect(createSession(classId, { ...base, prizes: [{ prizeId, quantity: 4 }] })).rejects.toThrow('库存不足');
  await expect(createSession(classId, { ...base, prizes: [{ prizeId, quantity: 1.5 }] })).rejects.toThrow();
  await db.update(students).set({ archived: true }).where(eq(students.id, a));
  await expect(createSession(classId, base)).rejects.toThrow('已归档');
  await db.update(students).set({ archived: false }).where(eq(students.id, a));
});

test('draft edits replace candidates, active config freezes, completed session refuses rounds', async () => {
  const id = await createSession(classId, { mode: 'student-prize', studentIds: [a], prizes: [{ prizeId, quantity: 2 }], perStudentLimit: 1 });
  expect(await getSession(id)).toMatchObject({ status: 'draft', mode: 'student-prize', studentIds: [a], prizes: [{ prizeId, quantity: 2 }] });
  await updateDraftSession(id, { mode: 'prize-student', studentIds: [b], prizeId, roundCount: 1 });
  expect(await getSession(id)).toMatchObject({ status: 'draft', mode: 'prize-student', studentIds: [b], prizeId, roundCount: 1 });
  expect(await db.select().from(sessionPrizes).where(eq(sessionPrizes.sessionId, id))).toEqual([]);
  expect(await db.select().from(sessionStudents).where(eq(sessionStudents.sessionId, id))).toHaveLength(1);
  await expect(updateDraftSession(id, { mode: 'prize-student', studentIds: [foreign], prizeId, roundCount: 1 })).rejects.toThrow();
  expect(await getSession(id)).toMatchObject({ studentIds: [b] });
  await activateSession(id);
  await expect(updateDraftSession(id, { mode: 'prize-student', studentIds: [a], prizeId, roundCount: 1 })).rejects.toThrow('草稿');
  await expect(activateSession(id)).rejects.toThrow('草稿');
  await completeSession(id);
  expect(await getSession(id)).toMatchObject({ status: 'completed', studentIds: [b] });
  await expect(requireActiveSession(id)).rejects.toThrow('进行中');
  await expect(completeSession(id)).rejects.toThrow('进行中');
});

test('activation revalidates stock and archived candidates', async () => {
  const id = await createSession(classId, { mode: 'prize-student', studentIds: [a, b], prizeId, roundCount: 2 });
  await db.update(prizes).set({ stock: 1 }).where(eq(prizes.id, prizeId));
  await expect(activateSession(id)).rejects.toThrow('库存不足');
  await db.update(prizes).set({ stock: 3, archived: true }).where(eq(prizes.id, prizeId));
  await expect(activateSession(id)).rejects.toThrow('已归档');
  await db.update(prizes).set({ archived: false }).where(eq(prizes.id, prizeId));
  await db.update(students).set({ archived: true }).where(eq(students.id, b));
  await expect(activateSession(id)).rejects.toThrow('已归档');
  await db.update(students).set({ archived: false }).where(eq(students.id, b));
  await activateSession(id);
  expect((await db.select().from(lotterySessions).where(eq(lotterySessions.id, id)))[0].status).toBe('active');
});

test('revoked teacher and banned admin cannot mutate through old sessions', async () => {
  const id = await createSession(classId, { mode: 'student-prize', studentIds: [a], prizes: [{ prizeId, quantity: 1 }], perStudentLimit: 1 });
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)));
  await expect(createSession(classId, { mode: 'prize-student', studentIds: [a], prizeId, roundCount: 1 })).rejects.toThrow();
  await expect(updateDraftSession(id, { mode: 'prize-student', studentIds: [a], prizeId, roundCount: 1 })).rejects.toThrow();
  await expect(activateSession(id)).rejects.toThrow();
  await expect(listSessions(classId)).rejects.toThrow();
  cookie = adminCookie;
  await activateSession(id);
  await db.update(user).set({ banned: true }).where(eq(user.id, adminId));
  await expect(completeSession(id)).rejects.toThrow();
  await db.update(user).set({ banned: false }).where(eq(user.id, adminId));
  await completeSession(id);
});

test('an unfinished round prevents completion', async () => {
  cookie = adminCookie;
  const id = await createSession(classId, { mode: 'prize-student', studentIds: [a], prizeId, roundCount: 1 });
  await activateSession(id);
  const [round] = await db.insert(lotteryRounds).values({ classId, sessionId: id, startToken: randomUUID(), startedBy: teacherId }).returning({ id: lotteryRounds.id });
  await expect(completeSession(id)).rejects.toThrow('进行中的轮次');
  await db.update(lotteryRounds).set({ status: 'cancelled' }).where(eq(lotteryRounds.id, round.id));
  await completeSession(id);
});

test('form action validates numbers and activates persisted draft', async () => {
  cookie = adminCookie;
  const data = new FormData();
  data.set('classId', classId); data.set('mode', 'prize-student'); data.set('studentIds', String(a));
  data.set('prizeId', prizeId); data.set('roundCount', '1.5');
  expect((await saveSessionAction(data)).ok).toBe(false);
  data.set('roundCount', '1');
  const result = await saveSessionAction(data);
  expect(result, result.message).toMatchObject({ ok: true });
  const [row] = await db.select().from(lotterySessions).where(and(eq(lotterySessions.classId, classId), eq(lotterySessions.status, 'draft'))).orderBy(lotterySessions.createdAt);
  const activation = new FormData(); activation.set('sessionId', row.id);
  expect((await activateSessionAction(activation)).ok).toBe(true);
});

test('mode one activation checks current stock without reserving it at creation', async () => {
  cookie = adminCookie;
  const id = await createSession(classId, { mode: 'student-prize', studentIds: [a], prizes: [{ prizeId, quantity: 3 }], perStudentLimit: 1 });
  const [another] = await db.select().from(lotterySessions).where(eq(lotterySessions.id, id));
  expect(another.status).toBe('draft');
  await db.update(prizes).set({ stock: 2 }).where(eq(prizes.id, prizeId));
  await expect(activateSession(id)).rejects.toThrow('库存不足');
  await db.update(prizes).set({ stock: 3 }).where(eq(prizes.id, prizeId));
  await activateSession(id);
});

test('revocation while a write waits for the class lock leaves no draft', async () => {
  cookie = teacherCookie;
  const id = randomUUID();
  await db.insert(classes).values({ id, name: '撤权竞态班' });
  await db.insert(classTeachers).values({ classId: id, teacherId });
  const [{ id: candidate }] = await db.insert(students).values({ classId: id, studentNumber: '001', name: '甲' }).returning({ id: students.id });
  const [{ id: reward }] = await db.insert(prizes).values({ classId: id, name: '奖励', stock: 1 }).returning({ id: prizes.id });
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, id)).for('update');
    locked(); await gate;
  });
  await acquired;
  const writing = createSession(id, { mode: 'prize-student', studentIds: [candidate], prizeId: reward, roundCount: 1 });
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()
          AND wait_event_type = 'Lock' AND lower(query) LIKE '%classes%') AS blocked`);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(true);
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, teacherId)));
  } finally {
    release(); await holder;
  }
  await expect(writing).rejects.toThrow('无权访问班级');
  expect(await db.select().from(lotterySessions).where(eq(lotterySessions.classId, id))).toEqual([]);
});

test.each(['single', 'list'] as const)('%s read cannot outlive a committed teacher revocation', async (kind) => {
  cookie = teacherCookie;
  const id = randomUUID();
  await db.insert(classes).values({ id, name: '读取撤权班' });
  await db.insert(classTeachers).values({ classId: id, teacherId });
  const [{ id: candidate }] = await db.insert(students).values({ classId: id, studentNumber: '001', name: '保密学生' }).returning({ id: students.id });
  const [{ id: reward }] = await db.insert(prizes).values({ classId: id, name: '保密奖品', stock: 1 }).returning({ id: prizes.id });
  const sessionId = await createSession(id, { mode: 'student-prize', studentIds: [candidate], prizes: [{ prizeId: reward, quantity: 1 }], perStudentLimit: 1 });

  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE session_students IN ACCESS EXCLUSIVE MODE`);
    locked(); await gate;
  });
  await acquired;
  const reading = kind === 'single' ? getSession(sessionId) : listSessions(id);
  let removal: Promise<void> | undefined;
  let removalState: 'pending' | 'finished' | 'failed' = 'pending';
  let state: 'blocked' | 'finished' | 'failed' | undefined;
  let readOutcome: PromiseSettledResult<unknown> | undefined;
  try {
    let readBlocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()
          AND wait_event_type = 'Lock' AND lower(query) LIKE '%session_students%') AS blocked`);
      if (result.rows[0].blocked) { readBlocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(readBlocked).toBe(true);
    cookie = adminCookie;
    removal = removeTeacher(id, teacherId);
    void removal.then(() => { removalState = 'finished'; }, () => { removalState = 'failed'; });
    for (let attempt = 0; attempt < 200; attempt++) {
      if (removalState !== 'pending') { state = removalState; break; }
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()
          AND wait_event_type = 'Lock' AND lower(query) LIKE '%classes%') AS blocked`);
      if (result.rows[0].blocked) { state = 'blocked'; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    release();
    await holder;
    [readOutcome] = await Promise.allSettled([reading, removal]);
  }
  expect(state).toBe('blocked');
  expect(readOutcome).toMatchObject({ status: 'fulfilled' });
  const view = readOutcome?.status === 'fulfilled'
    ? kind === 'single' ? readOutcome.value : (readOutcome.value as Awaited<ReturnType<typeof listSessions>>)[0]
    : null;
  expect(view).toMatchObject({ id: sessionId, studentIds: [candidate], prizes: [{ prizeId: reward, quantity: 1 }] });
  expect(await db.select().from(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, teacherId)))).toEqual([]);
}, 15000);
