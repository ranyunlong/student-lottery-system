import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { classes, classTeachers, prizes, stockEvents } from '../../db/schema';
import { auth } from '../../lib/auth';
import { archivePrize, createPrize, adjustStock, getPrizeStock, importPrizes, listPrizes, listStockEvents } from './service';
import { adjustStockAction, archivePrizeAction, createPrizeAction } from './actions';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const classId = randomUUID(), otherClassId = randomUUID();
let teacherId: string, adminId: string, teacherCookie: string, adminCookie: string;
async function login(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  await auth.api.changePassword({ headers: new Headers({ cookie }), body: { currentPassword: password, newPassword: 'ChangedPassword123!' } });
  return cookie;
}
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeAll(async () => {
  const teacherEmail = randomUUID() + '@example.test', adminEmail = randomUUID() + '@example.test';
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: 'Prize Teacher', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminId = (await auth.api.createUser({ body: { email: adminEmail, name: 'Prize Admin', password: 'AdminPassword123!', role: 'admin' } })).user.id;
  teacherCookie = await login(teacherEmail, 'TeacherPassword123!');
  adminCookie = await login(adminEmail, 'AdminPassword123!');
  await db.insert(classes).values([{ id: classId, name: 'Prize Class' }, { id: otherClassId, name: 'Other Class' }]);
  await db.insert(classTeachers).values({ classId, teacherId });
  activeCookie = teacherCookie;
});
afterAll(async () => { await pool.end(); });

test('creation and adjustment append actor, reason and timestamp events', async () => {
  const id = await createPrize(classId, 'Notebook', 2, teacherId);
  expect(await getPrizeStock(id)).toBe(2);
  expect(await adjustStock(classId, id, -1, 'Count', teacherId)).toBe(1);
  await expect(adjustStock(classId, id, -2, 'Count', teacherId)).rejects.toThrow('库存不足');
  const events = await listStockEvents(id);
  expect(events).toHaveLength(2);
  expect(events).toMatchObject([
    { prizeId: id, delta: 2, actorId: teacherId },
    { prizeId: id, delta: -1, reason: 'Count', actorId: teacherId },
  ]);
  expect(events[0].reason.trim()).not.toBe('');
  expect(events.every((event) => event.createdAt instanceof Date)).toBe(true);
  expect(events.map((event) => event.actorName)).toEqual(['Prize Teacher', 'Prize Teacher']);
  expect(await getPrizeStock(id)).toBe(1);
});

test('Excel import creates missing prizes and atomically adds stock to active matching names', async () => {
  const existing = await createPrize(classId, 'Imported Pencil', 2, teacherId);
  const result = await importPrizes(classId, [
    { name: 'Imported Pencil', quantity: 3 },
    { name: 'Imported Eraser', quantity: 5 },
  ]);
  expect(result).toEqual({ inserted: 1, updated: 1 });
  expect(await getPrizeStock(existing)).toBe(5);
  const created = (await listPrizes(classId)).find((item) => item.name === 'Imported Eraser')!;
  expect(created.stock).toBe(5);
  expect((await listStockEvents(existing)).at(-1)).toMatchObject({ delta: 3, reason: 'Excel 导入补充库存', actorName: 'Prize Teacher' });
  await expect(importPrizes(classId, [
    { name: 'Imported Pencil', quantity: 1 }, { name: 'Imported Eraser', quantity: 2147483647 },
  ])).rejects.toThrow();
  expect(await getPrizeStock(existing)).toBe(5);
});

test('simultaneous decrements of one unit allow exactly one ledger change', async () => {
  const id = await createPrize(classId, 'Concurrent', 1, teacherId);
  const outcomes = await Promise.allSettled([
    adjustStock(classId, id, -1, 'Session A', teacherId),
    adjustStock(classId, id, -1, 'Session B', teacherId),
  ]);
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(await getPrizeStock(id)).toBe(0);
  expect((await listStockEvents(id)).map((event) => event.delta)).toEqual([1, -1]);
});

test('foreign IDs, zero delta, blank reason and spoofed actors leave stock unchanged', async () => {
  activeCookie = adminCookie;
  const foreign = await createPrize(otherClassId, 'Foreign', 3, adminId);
  activeCookie = teacherCookie;
  const local = await createPrize(classId, 'Local', 2, teacherId);
  await expect(adjustStock(classId, foreign, -1, 'Wrong class', teacherId)).rejects.toThrow();
  await expect(adjustStock(otherClassId, foreign, -1, 'No access', teacherId)).rejects.toThrow();
  await expect(adjustStock(classId, local, 0, 'No change', teacherId)).rejects.toThrow();
  await expect(adjustStock(classId, local, 1, '   ', teacherId)).rejects.toThrow();
  await expect(adjustStock(classId, local, 1.5, 'Fraction', teacherId)).rejects.toThrow();
  await expect(adjustStock(classId, local, 1, 'Spoof', 'spoof')).rejects.toThrow();
  await expect(createPrize(classId, 'Spoof', 1, 'spoof')).rejects.toThrow();
  await expect(getPrizeStock(foreign)).rejects.toThrow();
  await expect(listStockEvents(foreign)).rejects.toThrow();
  expect(await getPrizeStock(local)).toBe(2);
  expect(await listStockEvents(local)).toHaveLength(1);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, foreign))).toHaveLength(1);
});

test('active names are unique and archiving preserves history while allowing reuse', async () => {
  const id = await createPrize(classId, 'Reusable', 0, teacherId);
  await expect(createPrize(classId, ' Reusable ', 2, teacherId)).rejects.toThrow();
  await expect(createPrize(classId, 'Negative', -1, teacherId)).rejects.toThrow();
  await archivePrize(classId, id);
  await expect(adjustStock(classId, id, 1, 'Archived', teacherId)).rejects.toThrow();
  const replacement = await createPrize(classId, 'Reusable', 1, teacherId);
  expect(replacement).not.toBe(id);
  expect((await listPrizes(classId)).filter((prize) => prize.name === 'Reusable')).toHaveLength(2);
});

test('failed ledger insertion rolls back the stock update', async () => {
  const id = await createPrize(classId, 'Ledger rollback', 2, teacherId);
  await db.execute(sql.raw(`CREATE FUNCTION task8_reject_stock_event() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.reason = 'reject-event' THEN RAISE EXCEPTION 'injected ledger failure'; END IF;
    RETURN NEW; END; $$`));
  await db.execute(sql.raw('CREATE TRIGGER task8_reject_stock_event BEFORE INSERT ON stock_events FOR EACH ROW EXECUTE FUNCTION task8_reject_stock_event()'));
  try {
    await expect(adjustStock(classId, id, -1, 'reject-event', teacherId)).rejects.toThrow();
    expect(await getPrizeStock(id)).toBe(2);
    expect(await listStockEvents(id)).toHaveLength(1);
  } finally {
    await db.execute(sql.raw('DROP TRIGGER task8_reject_stock_event ON stock_events'));
    await db.execute(sql.raw('DROP FUNCTION task8_reject_stock_event()'));
  }
});

test('revocation while a mutation waits on class lock prevents its write', async () => {
  const id = randomUUID();
  await db.insert(classes).values({ id, name: 'Revocation race' });
  await db.insert(classTeachers).values({ classId: id, teacherId });
  let release!: () => void, locked!: () => void;
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, id)).for('update');
    locked();
    await gate;
  });
  await acquired;
  const writing = createPrize(id, 'Denied after lock', 1, teacherId);
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid()
          AND datname = current_database() AND wait_event_type = 'Lock'
          AND lower(query) LIKE '%classes%') AS blocked`);
      if (result.rows[0].blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(blocked).toBe(true);
    await db.delete(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, teacherId)));
  } finally {
    release();
    await holder;
  }
  await expect(writing).rejects.toThrow('无权访问班级');
  expect(await db.select().from(prizes).where(eq(prizes.classId, id))).toEqual([]);
});

test('form actions validate numbers and a revoked teacher cannot write', async () => {
  expect((await createPrizeAction(form({ classId, name: 'Form prize', openingStock: '2' }))).ok).toBe(true);
  const [prize] = await db.select().from(prizes).where(and(eq(prizes.classId, classId), eq(prizes.name, 'Form prize')));
  expect((await adjustStockAction(form({ classId, prizeId: prize.id, delta: '-1', reason: 'Count' }))).ok).toBe(true);
  expect((await adjustStockAction(form({ classId, prizeId: prize.id, delta: '1.5', reason: 'Count' }))).ok).toBe(false);
  expect(await getPrizeStock(prize.id)).toBe(1);
  expect((await archivePrizeAction(form({ classId, prizeId: prize.id }))).ok).toBe(true);
  await db.delete(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)));
  await expect(createPrize(classId, 'Revoked', 1, teacherId)).rejects.toThrow();
  await expect(createPrizeAction(form({ classId, name: 'Revoked form', openingStock: '1' }))).rejects.toThrow();
  await expect(listPrizes(classId)).rejects.toThrow();
});
