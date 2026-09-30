import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, pool } from '../../db/client';
import { classes, classTeachers, lotteryRounds, lotterySessions, prizes, sessionPrizes, sessionStudents, stockEvents, students, winningRecords } from '../../db/schema';
import { auth } from '../../lib/auth';
import { activateSession, completeSession, createSession } from './sessions';
import { cancelRound, startRound, stopRound } from './rounds';
import { cancelRoundAction, startRoundAction, stopRoundAction } from './rounds.actions';

let cookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let teacherId: string;
beforeAll(async () => {
  const email = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email, name: '轮次老师', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  const response = await auth.api.signInEmail({ body: { email, password: 'TeacherPassword123!' }, asResponse: true });
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie }), body: { currentPassword: 'TeacherPassword123!', newPassword: 'ChangedPassword123!' } });
});
afterAll(async () => { await pool.end(); });

async function fixture(stock = 3) {
  const classId = randomUUID();
  await db.insert(classes).values({ id: classId, name: '轮次测试班' });
  await db.insert(classTeachers).values({ classId, teacherId });
  const [a, b] = await db.insert(students).values([
    { classId, studentNumber: '001', name: '甲' }, { classId, studentNumber: '002', name: '乙' },
  ]).returning();
  const [prize] = await db.insert(prizes).values({ classId, name: '奖品', stock }).returning();
  return { classId, a, b, prize };
}

async function modeOne(f: Awaited<ReturnType<typeof fixture>>, quantity = 3, limit = 2) {
  const id = await createSession(f.classId, { mode: 'student-prize', studentIds: [f.a.id, f.b.id], prizes: [{ prizeId: f.prize.id, quantity: Math.max(quantity, 3) }], perStudentLimit: limit });
  await activateSession(id);
  return id;
}

async function modeTwo(f: Awaited<ReturnType<typeof fixture>>, count = 2) {
  const id = await createSession(f.classId, { mode: 'prize-student', studentIds: [f.a.id, f.b.id], prizeId: f.prize.id, roundCount: count });
  await activateSession(id);
  return id;
}

test('stopping commits one win from reserved stock; repeat returns committed snapshots', async () => {
  const f = await fixture();
  const sessionId = await modeOne(f);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toHaveLength(0);
  const first = await stopRound(token, teacherId);
  expect(first).toMatchObject({ studentId: f.a.id, studentName: '甲', prizeId: f.prize.id, prizeName: '奖品' });
  await db.update(students).set({ name: '新姓名' }).where(eq(students.id, f.a.id));
  await db.update(prizes).set({ name: '新奖品' }).where(eq(prizes.id, f.prize.id));
  expect(await stopRound(token, teacherId)).toEqual(first);
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toHaveLength(1);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, first.winId))).toMatchObject([{ delta: 0, prizeId: f.prize.id }]);
  expect((await db.select().from(sessionStudents).where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, f.a.id))))[0].usedCount).toBe(1);
  expect((await db.select().from(sessionPrizes).where(eq(sessionPrizes.sessionId, sessionId)))[0].usedCount).toBe(1);
});

test('pending round survives a new call, blocks another start and can be cancelled without a win', async () => {
  const f = await fixture();
  const sessionId = await modeOne(f);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  expect((await db.select().from(lotteryRounds).where(eq(lotteryRounds.id, roundId)))[0]).toMatchObject({ startToken: token, status: 'active', studentId: f.a.id });
  expect(await startRound(sessionId, teacherId, f.a.id)).toEqual({ roundId, token });
  await expect(startRound(sessionId, teacherId, f.b.id)).rejects.toThrow();
  await expect(completeSession(sessionId)).rejects.toThrow();
  await cancelRound(token, teacherId);
  await cancelRound(token, teacherId);
  await expect(stopRound(token, teacherId)).rejects.toThrow();
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toEqual([]);
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
  await startRound(sessionId, teacherId, f.b.id);
});

test('concurrent stops of one token return the same win without a second stock event', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  const [first, second] = await Promise.all([stopRound(token, teacherId), stopRound(token, teacherId)]);
  expect(second).toEqual(first);
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toHaveLength(1);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, first.winId))).toHaveLength(1);
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
});

test('concurrent sessions cannot reserve the same available stock', async () => {
  const f = await fixture(3);
  const firstSession = await createSession(f.classId, { mode: 'student-prize', studentIds: [f.a.id], prizes: [{ prizeId: f.prize.id, quantity: 3 }], perStudentLimit: 3 });
  const secondSession = await createSession(f.classId, { mode: 'student-prize', studentIds: [f.b.id], prizes: [{ prizeId: f.prize.id, quantity: 3 }], perStudentLimit: 3 });
  const activations = await Promise.allSettled([activateSession(firstSession), activateSession(secondSession)]);
  expect(activations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(activations.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
  const active = activations[0].status === 'fulfilled' ? firstSession : secondSession;
  await completeSession(active);
});

test('mode two may repeat winners and completes after the configured rounds', async () => {
  const f = await fixture(3);
  const sessionId = await createSession(f.classId, { mode: 'prize-student', studentIds: [f.a.id], prizeId: f.prize.id, roundCount: 3 });
  await activateSession(sessionId);
  const winners = [];
  for (let index = 0; index < 3; index++) winners.push(await stopRound((await startRound(sessionId, teacherId)).token, teacherId));
  expect(winners.map((win) => win.studentId)).toEqual([f.a.id, f.a.id, f.a.id]);
  await expect(startRound(sessionId, teacherId)).rejects.toThrow();
  expect((await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)))[0].status).toBe('completed');
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
});

test('mode two can draw a previously winning candidate while other candidates are archived', async () => {
  const f = await fixture(2);
  const sessionId = await modeTwo(f);
  const { token } = await startRound(sessionId, teacherId);
  const [previous] = await db.insert(lotteryRounds).values({ classId: f.classId, sessionId, startToken: randomUUID(),
    status: 'completed', startedBy: teacherId, stoppedBy: teacherId }).returning();
  await db.insert(winningRecords).values({ classId: f.classId, sessionId, roundId: previous.id, studentId: f.a.id,
    studentNumberSnapshot: '001', studentNameSnapshot: '甲', prizeId: f.prize.id,
    prizeNameSnapshot: '奖品', actorId: teacherId });
  await db.update(students).set({ archived: true }).where(eq(students.id, f.b.id));
  await expect(stopRound(token, teacherId)).resolves.toMatchObject({ studentId: f.a.id });
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, sessionId))).toHaveLength(2);
});

test('stop rechecks current assignment and eligibility without consuming a pending round', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  await expect(stopRound(token, teacherId)).rejects.toThrow();
  await db.insert(classTeachers).values({ classId: f.classId, teacherId });
  await db.update(students).set({ archived: true }).where(eq(students.id, f.a.id));
  await expect(stopRound(token, teacherId)).rejects.toThrow();
  await db.update(students).set({ archived: false }).where(eq(students.id, f.a.id));
  await db.update(prizes).set({ archived: true }).where(eq(prizes.id, f.prize.id));
  await expect(stopRound(token, teacherId)).rejects.toThrow();
  expect((await db.select().from(lotteryRounds).where(eq(lotteryRounds.id, roundId)))[0].status).toBe('active');
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toEqual([]);
  await cancelRound(token, teacherId);
  await completeSession(sessionId);
});

test('mode one rejects a student past the limit while another candidate remains eligible', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 2, 1);
  await stopRound((await startRound(sessionId, teacherId, f.a.id)).token, teacherId);
  await expect(startRound(sessionId, teacherId, f.a.id)).rejects.toThrow('次数上限');
  await expect(startRound(sessionId, teacherId, f.b.id)).resolves.toMatchObject({ token: expect.any(String) });
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
});

test('automatically completes mode one when its reserved quota is consumed', async () => {
  const f = await fixture(3);
  const sessionId = await createSession(f.classId, { mode: 'student-prize', studentIds: [f.a.id], prizes: [{ prizeId: f.prize.id, quantity: 2 }], perStudentLimit: 2 });
  await activateSession(sessionId);
  await stopRound((await startRound(sessionId, teacherId, f.a.id)).token, teacherId);
  await stopRound((await startRound(sessionId, teacherId, f.a.id)).token, teacherId);
  const [session] = await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
  expect(session.status).toBe('completed');
  await expect(startRound(sessionId, teacherId, f.b.id)).rejects.toThrow();
});

test('automatically completes mode one after every candidate reaches their draw limit', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 3, 1);
  await stopRound((await startRound(sessionId, teacherId, f.a.id)).token, teacherId);
  expect((await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)))[0].status).toBe('active');

  await stopRound((await startRound(sessionId, teacherId, f.b.id)).token, teacherId);

  expect((await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)))[0].status).toBe('completed');
});

test('fixed-prize mode completes after consuming all configured reserved rounds', async () => {
  const f = await fixture(3);
  const sessionId = await modeTwo(f, 2);
  const first = await startRound(sessionId, teacherId);
  await stopRound(first.token, teacherId);
  expect((await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId)))[0].status).toBe('active');
  const second = await startRound(sessionId, teacherId);
  await stopRound(second.token, teacherId);
  const [session] = await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
  expect(session.status).toBe('completed');
  await expect(startRound(sessionId, teacherId)).rejects.toThrow();
});

test('automatically completes fixed-prize mode at its configured round limit', async () => {
  const f = await fixture(3);
  const sessionId = await modeTwo(f, 1);
  const { token } = await startRound(sessionId, teacherId);
  await stopRound(token, teacherId);
  const [session] = await db.select({ status: lotterySessions.status }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
  expect(session.status).toBe('completed');
});

test('current authenticated actor is required even with a valid actor id', async () => {
  const f = await fixture();
  const sessionId = await modeOne(f);
  await expect(startRound(sessionId, randomUUID(), f.a.id)).rejects.toThrow();
  const { token } = await startRound(sessionId, teacherId, f.a.id);
  await expect(stopRound(token, randomUUID())).rejects.toThrow();
  await expect(cancelRound(token, randomUUID())).rejects.toThrow();
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
});

test('server actions use the current login and return persisted start and stop results', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const start = new FormData(); start.set('sessionId', sessionId); start.set('selectedStudentId', String(f.a.id));
  const started = await startRoundAction(start);
  expect(started).toMatchObject({ ok: true, roundId: expect.any(String), token: expect.any(String) });
  if (!started.ok) throw new Error(started.message);
  const stop = new FormData(); stop.set('token', started.token);
  const stopped = await stopRoundAction(stop);
  expect(stopped).toMatchObject({ ok: true, result: { studentId: f.a.id, prizeId: f.prize.id } });
  expect(await cancelRoundAction(stop)).toMatchObject({ ok: false });
});

test('start action reports its committed round when cache invalidation fails', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const data = new FormData(); data.set('sessionId', sessionId); data.set('selectedStudentId', String(f.a.id));
  vi.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error('cache unavailable'); });
  try {
    const response = await startRoundAction(data);
    expect(response).toMatchObject({ ok: true, roundId: expect.any(String), token: expect.any(String) });
    const [round] = await db.select().from(lotteryRounds).where(eq(lotteryRounds.sessionId, sessionId));
    expect(round).toMatchObject({ id: response.ok ? response.roundId : '', status: 'active' });
    expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, round.id))).toEqual([]);
  } finally { vi.mocked(revalidatePath).mockReset(); }
});

test('stop action returns the committed draw result when cache invalidation fails', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  const data = new FormData(); data.set('token', token);
  vi.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error('cache unavailable'); });
  try {
    const response = await stopRoundAction(data);
    const [record] = await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId));
    expect(response).toEqual({ ok: true, result: { winId: record.id, studentId: f.a.id, studentName: '甲', prizeId: f.prize.id, prizeName: '奖品' } });
    expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
    expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, record.id))).toHaveLength(1);
  } finally { vi.mocked(revalidatePath).mockReset(); }
});

test('cancel action reports success after cancellation despite cache invalidation failure', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  const data = new FormData(); data.set('token', token);
  vi.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error('cache unavailable'); });
  try {
    expect(await cancelRoundAction(data)).toEqual({ ok: true });
    expect((await db.select().from(lotteryRounds).where(eq(lotteryRounds.id, roundId)))[0].status).toBe('cancelled');
    expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toEqual([]);
  } finally { vi.mocked(revalidatePath).mockReset(); }
});

test('action authorization failures remain failures and do not reveal a draw result', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  const data = new FormData(); data.set('token', token);
  const start = new FormData(); start.set('sessionId', sessionId); start.set('selectedStudentId', String(f.a.id));
  expect(await startRoundAction(start)).toEqual({ ok: false, message: expect.any(String) });
  expect(await stopRoundAction(data)).toEqual({ ok: false, message: expect.any(String) });
  expect(await cancelRoundAction(data)).toEqual({ ok: false, message: expect.any(String) });
  expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toEqual([]);
});

test('ledger insert failure rolls back the win, stock, counters and round completion', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { roundId, token } = await startRound(sessionId, teacherId, f.a.id);
  const name = 'task11_fail_' + randomUUID().replaceAll('-', '');
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.prize_id = '${f.prize.id}'::uuid THEN RAISE EXCEPTION 'task11 ledger insert failed'; END IF;
      RETURN NEW;
    END $$`);
  try {
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON stock_events FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    await expect(stopRound(token, teacherId)).rejects.toMatchObject({ cause: { message: expect.stringContaining('task11 ledger insert failed') } });
    const data = new FormData(); data.set('token', token);
    expect(await stopRoundAction(data)).toEqual({ ok: false, message: '操作失败，请重试' });
    expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toEqual([]);
    expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, f.prize.id))).toMatchObject([{ delta: -3, winningRecordId: null }]);
    expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
    expect((await db.select().from(sessionStudents).where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, f.a.id))))[0].usedCount).toBe(0);
    expect((await db.select().from(sessionPrizes).where(and(eq(sessionPrizes.sessionId, sessionId), eq(sessionPrizes.prizeId, f.prize.id))))[0].usedCount).toBe(0);
    expect((await db.select().from(lotteryRounds).where(eq(lotteryRounds.id, roundId)))[0]).toMatchObject({ status: 'active', stoppedAt: null, stopToken: null });
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON stock_events`);
    await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
});

test('stop waiting on class lock sees revocation committed before it enters the transaction', async () => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const { token } = await startRound(sessionId, teacherId, f.a.id);
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, f.classId)).for('update');
    locked(); await gate;
  });
  await acquired;
  const stopping = stopRound(token, teacherId);
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
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  } finally { release(); await holder; }
  await expect(stopping).rejects.toThrow();
  expect((await db.select().from(prizes).where(eq(prizes.id, f.prize.id)))[0].stock).toBe(0);
});

test.each(['start', 'cancel'] as const)('%s waiting on class lock rechecks revoked assignment', async (kind) => {
  const f = await fixture(3);
  const sessionId = await modeOne(f, 1, 1);
  const pending = kind === 'cancel' ? await startRound(sessionId, teacherId, f.a.id) : null;
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, f.classId)).for('update');
    locked(); await gate;
  });
  await acquired;
  const writing = kind === 'start' ? startRound(sessionId, teacherId, f.a.id) : cancelRound(pending!.token, teacherId);
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
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  } finally { release(); await holder; }
  await expect(writing).rejects.toThrow();
  const rounds = await db.select().from(lotteryRounds).where(eq(lotteryRounds.sessionId, sessionId));
  expect(rounds).toHaveLength(kind === 'start' ? 0 : 1);
  if (pending) expect(rounds[0].status).toBe('active');
}, 15000);
