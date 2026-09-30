import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { user } from '../../db/auth-schema';
import { classes, classTeachers, prizes, redemptionAudit, stockEvents, students, winningRecords } from '../../db/schema';
import { auth } from '../../lib/auth';
import { activateSession, createSession } from '../lotteries/sessions';
import { startRound, stopRound } from '../lotteries/rounds';
import { getPrizeStock } from '../prizes/service';
import { listAdminAudit, listAdminAuditPage } from '../classes/service';
import { correctRedemption, findRedeemedWinForCorrection, listRedemptionAudit, listWinnings, redeemWin } from './service';
import { correctRedemptionAction, redeemWinAction } from './actions';

let cookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let teacherId: string, adminId: string, teacherCookie: string, adminCookie: string;
async function login(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const value = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie: value }), body: { currentPassword: password, newPassword: 'ChangedPassword123!' } });
  return value;
}
beforeAll(async () => {
  const teacherEmail = randomUUID() + '@example.test', adminEmail = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: '兑换老师', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminId = (await auth.api.createUser({ body: { email: adminEmail, name: '兑换管理员', password: 'AdminPassword123!', role: 'admin' } })).user.id;
  teacherCookie = await login(teacherEmail, 'TeacherPassword123!');
  adminCookie = await login(adminEmail, 'AdminPassword123!');
  cookie = teacherCookie;
});
afterAll(async () => { await pool.end(); });
async function fixture(studentName = '原姓名', studentNumber = '001') {
  const classId = randomUUID();
  await db.insert(classes).values({ id: classId, name: '兑换班' });
  await db.insert(classTeachers).values({ classId, teacherId });
  const [student] = await db.insert(students).values({ classId, studentNumber, name: studentName }).returning();
  const [prize] = await db.insert(prizes).values({ classId, name: '原奖品', stock: 2 }).returning();
  const sessionId = await createSession(classId, { mode: 'student-prize', studentIds: [student.id], prizes: [{ prizeId: prize.id, quantity: 2 }], perStudentLimit: 1 });
  await activateSession(sessionId);
  const { token } = await startRound(sessionId, teacherId, student.id);
  const { winId } = await stopRound(token, teacherId);
  return { classId, student, prize, winId };
}

test('redeems once without consuming stock or changing draw snapshots', async () => {
  const f = await fixture();
  const before = await getPrizeStock(f.prize.id);
  await db.update(students).set({ name: '新姓名', studentNumber: '009' }).where(eq(students.id, f.student.id));
  await db.update(prizes).set({ name: '新奖品' }).where(eq(prizes.id, f.prize.id));
  await redeemWin(f.classId, f.winId, teacherId);
  expect((await listWinnings(f.classId, 'pending')).map((w) => w.id)).not.toContain(f.winId);
  expect(await listWinnings(f.classId, 'redeemed')).toMatchObject([{ id: f.winId, studentNumberSnapshot: '001', studentNameSnapshot: '原姓名', prizeNameSnapshot: '原奖品', redeemedBy: teacherId, redeemedAt: expect.any(Date) }]);
  expect(await getPrizeStock(f.prize.id)).toBe(before);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, f.winId))).toHaveLength(1);
  await expect(redeemWin(f.classId, f.winId, teacherId)).rejects.toThrow('已兑换');
  expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toMatchObject([{ actorId: teacherId, previousStatus: 'pending', newStatus: 'redeemed', reason: null }]);
});

test('other-class win IDs and revoked assignments cannot be read or mutated', async () => {
  const f = await fixture(), other = await fixture();
  await expect(redeemWin(f.classId, other.winId, teacherId)).rejects.toThrow();
  expect((await listWinnings(f.classId)).map((w) => w.id)).not.toContain(other.winId);
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  await expect(listWinnings(f.classId)).rejects.toThrow();
  await expect(redeemWin(f.classId, f.winId, teacherId)).rejects.toThrow();
  expect((await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId)))[0].redemptionStatus).toBe('pending');
});

test('only an authenticated admin corrects a redeemed win with reason and audit', async () => {
  const f = await fixture();
  await redeemWin(f.classId, f.winId, teacherId);
  await expect(correctRedemption(f.winId, '误标', teacherId)).rejects.toThrow();
  cookie = adminCookie;
  try {
    await expect(correctRedemption(f.winId, '  ', adminId)).rejects.toThrow('原因');
    await expect(correctRedemption(f.winId, '误标', teacherId)).rejects.toThrow();
    const before = await getPrizeStock(f.prize.id);
    await correctRedemption(f.winId, '  操作失误  ', adminId);
    const [win] = await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId));
    expect(win).toMatchObject({ redemptionStatus: 'pending', redeemedBy: null, redeemedAt: null, studentNameSnapshot: '原姓名', prizeNameSnapshot: '原奖品' });
    expect(await getPrizeStock(f.prize.id)).toBe(before);
    expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toMatchObject([
      { actorId: teacherId, previousStatus: 'pending', newStatus: 'redeemed' },
      { actorId: adminId, previousStatus: 'redeemed', newStatus: 'pending', reason: '操作失误' },
    ]);
    expect((await listRedemptionAudit()).events.some((event) => event.winningRecordId === f.winId && event.reason === '操作失误')).toBe(true);
    await expect(correctRedemption(f.winId, '再纠正', adminId)).rejects.toThrow();
  } finally { cookie = teacherCookie; }
});

test('concurrent redemption has one winner and one audit row', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([redeemWin(f.classId, f.winId, teacherId), redeemWin(f.classId, f.winId, teacherId)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toHaveLength(1);
});

test('redeem waiting on the class lock rechecks a revoked assignment', async () => {
  const f = await fixture();
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => { await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, f.classId)).for('update'); locked(); await gate; });
  await acquired;
  const writing = redeemWin(f.classId, f.winId, teacherId);
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database() AND wait_event_type = 'Lock' AND lower(query) LIKE '%classes%') AS blocked`);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(true);
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, f.classId), eq(classTeachers.teacherId, teacherId)));
  } finally { release(); await holder; }
  await expect(writing).rejects.toThrow();
  expect((await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId)))[0].redemptionStatus).toBe('pending');
}, 15000);

test('actions reject foreign class ID and teacher correction', async () => {
  const f = await fixture(), other = await fixture();
  const redeem = new FormData(); redeem.set('classId', f.classId); redeem.set('winId', other.winId);
  expect(await redeemWinAction(redeem)).toMatchObject({ ok: false });
  const correct = new FormData(); correct.set('winId', f.winId); correct.set('reason', '误标');
  expect(await correctRedemptionAction(correct)).toMatchObject({ ok: false });
  expect((await db.select().from(winningRecords).where(eq(winningRecords.id, other.winId)))[0].redemptionStatus).toBe('pending');
});

test('audit insertion failure rolls back a redemption and a correction', async () => {
  const f = await fixture();
  const name = 'task12_fail_' + randomUUID().replaceAll('-', '');
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.winning_record_id = '${f.winId}'::uuid THEN RAISE EXCEPTION 'task12 audit failure'; END IF; RETURN NEW; END $$`);
  try {
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON redemption_audit FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    await expect(redeemWin(f.classId, f.winId, teacherId)).rejects.toThrow();
    expect((await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId)))[0]).toMatchObject({ redemptionStatus: 'pending', redeemedBy: null, redeemedAt: null });
    await pool.query(`DROP TRIGGER ${name} ON redemption_audit`);
    await redeemWin(f.classId, f.winId, teacherId);
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON redemption_audit FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    cookie = adminCookie;
    try { await expect(correctRedemption(f.winId, '误标', adminId)).rejects.toThrow(); }
    finally { cookie = teacherCookie; }
    expect((await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId)))[0]).toMatchObject({ redemptionStatus: 'redeemed', redeemedBy: teacherId, redeemedAt: expect.any(Date) });
    expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toHaveLength(1);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON redemption_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
});

test('correction permits a new redemption without a second draw deduction', async () => {
  const f = await fixture();
  await redeemWin(f.classId, f.winId, teacherId);
  cookie = adminCookie;
  try { await correctRedemption(f.winId, '误操作', adminId); }
  finally { cookie = teacherCookie; }
  const data = new FormData(); data.set('classId', f.classId); data.set('winId', f.winId);
  expect(await redeemWinAction(data)).toMatchObject({ ok: true });
  expect((await listWinnings(f.classId, 'redeemed')).map((w) => w.id)).toContain(f.winId);
  expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toHaveLength(3);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, f.winId))).toHaveLength(1);
  expect(await getPrizeStock(f.prize.id)).toBe(1);
});

test('correction waiting on class lock rechecks administrator role', async () => {
  const f = await fixture();
  await redeemWin(f.classId, f.winId, teacherId);
  await db.insert(classTeachers).values({ classId: f.classId, teacherId: adminId });
  cookie = adminCookie;
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.transaction(async (tx) => { await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, f.classId)).for('update'); locked(); await gate; });
  await acquired;
  const writing = correctRedemption(f.winId, '误标', adminId);
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database() AND wait_event_type = 'Lock' AND lower(query) LIKE '%classes%') AS blocked`);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(true);
    await db.update(user).set({ role: 'user' }).where(eq(user.id, adminId));
  } finally { release(); await holder; }
  try { await expect(writing).rejects.toThrow('管理员'); }
  finally { await db.update(user).set({ role: 'admin' }).where(eq(user.id, adminId)); cookie = teacherCookie; }
  expect((await db.select().from(winningRecords).where(eq(winningRecords.id, f.winId)))[0].redemptionStatus).toBe('redeemed');
  expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, f.winId))).toHaveLength(1);
}, 15000);

test.each([
  ['redemption_audit', () => listRedemptionAudit()],
  ['admin_audit', () => listAdminAudit()],
  ['admin_audit', () => listAdminAuditPage({})],
] as const)('%s audit read cannot return data after a committed demotion', async (table, read) => {
  const f = await fixture();
  await redeemWin(f.classId, f.winId, teacherId);
  cookie = adminCookie;
  const blocker = await pool.connect();
  let started = false;
  let reading: Promise<unknown> | undefined;
  let demotion: Promise<unknown> | undefined;
  try {
    await blocker.query('BEGIN');
    started = true;
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    reading = read();
    let blocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const activity = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()
          AND wait_event_type = 'Lock' AND lower(query) LIKE $1) AS blocked`, [`%${table}%`]);
      if (activity.rows[0].blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(true);
    demotion = db.update(user).set({ role: 'user' }).where(eq(user.id, adminId));
    const committedBeforeRead = await Promise.race([
      demotion.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 200)),
    ]);
    await blocker.query('ROLLBACK');
    started = false;
    if (committedBeforeRead) await expect(reading).rejects.toThrow('管理员');
    else await expect(reading).resolves.toBeDefined();
    await demotion;
  } finally {
    if (started) await blocker.query('ROLLBACK');
    blocker.release();
    if (reading) await reading.catch(() => undefined);
    if (demotion) await demotion.catch(() => undefined);
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, adminId));
    cookie = teacherCookie;
  }
}, 15000);

test('redemption audit supports 25-row next and previous pages and older wins remain correctable', async () => {
  const older = await fixture();
  await redeemWin(older.classId, older.winId, teacherId);
  const later = await fixture();
  await redeemWin(later.classId, later.winId, teacherId);
  await db.insert(redemptionAudit).values(Array.from({ length: 101 }, (_, index) => ({
    classId: later.classId, winningRecordId: later.winId, actorId: teacherId,
    previousStatus: 'pending', newStatus: 'redeemed', reason: `后续事件 ${index}`,
  })));
  cookie = adminCookie;
  try {
    const first = await listRedemptionAudit();
    expect(first.events).toHaveLength(25);
    expect(first.events.some((event) => event.winningRecordId === older.winId)).toBe(false);
    expect(await findRedeemedWinForCorrection(older.winId)).toMatchObject({ id: older.winId,
      studentNumberSnapshot: '001', studentNameSnapshot: '原姓名', prizeNameSnapshot: '原奖品' });
    let cursor = first.nextCursor;
    let found = false;
    let previousCursor: string | null = null;
    let priorPageIds: string[] = [];
    let currentPageIds: string[] = [];
    for (let page = 0; cursor && page < 6; page++) {
      const result = await listRedemptionAudit(cursor, 'next');
      priorPageIds = currentPageIds;
      currentPageIds = result.events.map((event) => event.id);
      previousCursor = result.previousCursor;
      found ||= result.events.some((event) => event.winningRecordId === older.winId);
      cursor = result.nextCursor;
    }
    expect(found).toBe(true);
    expect(previousCursor).toBeTruthy();
    expect((await listRedemptionAudit(previousCursor!, 'prev')).events.map((event) => event.id)).toEqual(priorPageIds);
    const before = await getPrizeStock(older.prize.id);
    await correctRedemption(older.winId, '历史记录误标', adminId);
    expect((await db.select().from(winningRecords).where(eq(winningRecords.id, older.winId)))[0]).toMatchObject({
      redemptionStatus: 'pending', studentNameSnapshot: '原姓名', prizeNameSnapshot: '原奖品',
    });
    expect(await getPrizeStock(older.prize.id)).toBe(before);
    expect(await db.select().from(stockEvents).where(eq(stockEvents.winningRecordId, older.winId))).toHaveLength(1);
    expect(await findRedeemedWinForCorrection(older.winId)).toBeNull();
    await expect(listRedemptionAudit('invalid')).rejects.toThrow();
  } finally { cookie = teacherCookie; }
  await expect(findRedeemedWinForCorrection(older.winId)).rejects.toThrow('管理员');
});

test('audit filters by Shanghai day and student snapshots before cursor pagination', async () => {
  const tag = `审计筛选${randomUUID().slice(0, 8)}`;
  const earlier = await fixture(`${tag}%`), later = await fixture(`${tag}甲`, '778899');
  await redeemWin(earlier.classId, earlier.winId, teacherId);
  await redeemWin(later.classId, later.winId, teacherId);
  await db.insert(redemptionAudit).values([
    { classId: earlier.classId, winningRecordId: earlier.winId, actorId: teacherId,
      previousStatus: 'pending', newStatus: 'redeemed', createdAt: new Date('2026-08-31T15:59:00Z') },
    { classId: later.classId, winningRecordId: later.winId, actorId: teacherId,
      previousStatus: 'pending', newStatus: 'redeemed', createdAt: new Date('2026-08-31T16:01:00Z') },
  ]);
  await db.insert(redemptionAudit).values(Array.from({ length: 26 }, () => ({
    classId: later.classId, winningRecordId: later.winId, actorId: teacherId,
    previousStatus: 'pending', newStatus: 'redeemed', createdAt: new Date('2026-08-31T16:01:00Z'),
  })));
  cookie = adminCookie;
  try {
    const filters = { date: '2026-09-01', keyword: tag };
    const first = await listRedemptionAudit(undefined, 'next', filters);
    expect(first.events).toHaveLength(25);
    expect(first.events.every((event) => event.winningRecordId === later.winId)).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const second = await listRedemptionAudit(first.nextCursor!, 'next', filters);
    expect(second.events).toHaveLength(2);
    expect((await listRedemptionAudit(second.previousCursor!, 'prev', filters)).events.map((event) => event.id))
      .toEqual(first.events.map((event) => event.id));
    expect((await listRedemptionAudit(undefined, 'next', { date: '2026-09-01', keyword: '789' })).events).toHaveLength(0);
    expect((await listRedemptionAudit(undefined, 'next', { date: '2026-09-01', keyword: '8899' })).events).toHaveLength(25);
    expect((await listRedemptionAudit(undefined, 'next', { date: '2026-08-31', keyword: '%' })).events.map((event) => event.winningRecordId))
      .toEqual([earlier.winId]);
    expect((await listRedemptionAudit(undefined, 'next', { date: '2026-02-30', keyword: tag })).events).toHaveLength(0);
  } finally { cookie = teacherCookie; }
});
