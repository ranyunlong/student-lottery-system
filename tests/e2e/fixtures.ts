import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { test as base, expect, type Page } from '@playwright/test';
import { auth } from '../../src/lib/auth';
import { user } from '../../src/db/auth-schema';
import { db, pool } from '../../src/db/client';
import { createFixturePassword } from '../e2e-support/runtime-env.mjs';
import {
  adminAudit, classTeachers, classes, lotteryRounds, lotterySessions, prizes,
  redemptionAudit, sessionPrizes, sessionStudents, stockEvents, students, winningRecords,
} from '../../src/db/schema';

if (
  process.env.DATABASE_URL !== process.env.E2E_RUN_DATABASE_URL
  || !/^lottery_e2e_run_[a-f0-9]{32}$/.test(process.env.E2E_RUN_DATABASE_NAME ?? '')
  || new URL(process.env.DATABASE_URL ?? '').pathname !== `/${process.env.E2E_RUN_DATABASE_NAME}`
) {
  throw new Error('Playwright fixtures may only use this invocation’s isolated PostgreSQL 17 E2E database.');
}

export type TeacherSession = {
  email: string;
  password: string;
  temporaryPassword: string;
  teacherId: string;
  classId: string;
  sessionId: string;
  studentIds: number[];
  prizeId: string;
  initialStock: number;
};

export type AdminSession = {
  id: string;
  email: string;
  password: string;
  outsiderId: string;
  outsiderEmail: string;
  outsiderPassword: string;
  createdTeacherIds: string[];
  classIds: string[];
};

type SessionOptions = {
  mode?: 'prize-student' | 'student-prize';
  rounds?: number;
  studentCount?: number;
  studentDrawLimit?: number;
  prizeQuantity?: number;
  initialStock?: number;
};

async function createIdentity(name: string, role: 'admin' | 'user') {
  const email = `${randomUUID()}@task15.example.test`;
  const password = createFixturePassword();
  const created = await auth.api.createUser({ body: { email, name, password, role } });
  if (role === 'admin') await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, created.user.id));
  return { id: created.user.id, email, password };
}

export async function seedTeacherSession(options: SessionOptions = {}): Promise<TeacherSession> {
  const mode = options.mode ?? 'prize-student';
  const rounds = options.rounds ?? 3;
  const studentCount = options.studentCount ?? 3;
  const teacher = await createIdentity('Task15 老师', 'user');
  const password = createFixturePassword();
  const classId = randomUUID();
  const sessionId = randomUUID();
  const prizeId = randomUUID();
  const className = `Task15 班级 ${classId.slice(0, 8)}`;
  await db.insert(classes).values({ id: classId, name: className });
  await db.insert(classTeachers).values({ classId, teacherId: teacher.id });
  const roster = await db.insert(students).values(Array.from({ length: studentCount }, (_, index) => ({
    classId,
    studentNumber: String(index + 1).padStart(3, '0'),
    name: `Task15 ${['\u7532', '\u4e59', '\u4e19', '\u4e01', '\u620a', '\u5df1'][index] ?? `\u5b66\u751f${index + 1}`}\u540c\u5b66`,
  }))).returning({ id: students.id });
  const initialStock = options.initialStock ?? Math.max(rounds + 1, 4);
  await db.insert(prizes).values({ id: prizeId, classId, name: `Task15 奖品 ${classId.slice(0, 4)}`, stock: initialStock });
  await db.insert(lotterySessions).values({
    id: sessionId, classId, mode: mode === 'prize-student' ? 'prize_student' : 'student_prize',
    status: 'active', studentDrawLimit: mode === 'student-prize' ? options.studentDrawLimit ?? 2 : null,
    fixedPrizeId: mode === 'prize-student' ? prizeId : null,
    roundLimit: mode === 'prize-student' ? rounds : null, createdBy: teacher.id,
  });
  await db.insert(sessionStudents).values(roster.map((student) => ({ classId, sessionId, studentId: student.id })));
  if (mode === 'student-prize') {
    await db.insert(sessionPrizes).values({ classId, sessionId, prizeId, quantityLimit: options.prizeQuantity ?? 3 });
  }
  return {
    email: teacher.email, password, temporaryPassword: teacher.password, teacherId: teacher.id,
    classId, sessionId, studentIds: roster.map((student) => student.id), prizeId, initialStock,
  };
}

export async function loginAsTeacher(page: Page, session: TeacherSession) {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(session.email);
  await page.getByLabel('密码').fill(session.temporaryPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/change-password');
  await page.getByLabel('当前密码').fill(session.temporaryPassword);
  await page.getByLabel('新密码', { exact: true }).fill(session.password);
  await page.getByLabel('确认新密码').fill(session.password);
  await page.getByRole('button', { name: '修改密码' }).click();
  await page.waitForURL('**/teacher');
}

export async function loginAsAdmin(page: Page, session: AdminSession) {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(session.email);
  await page.getByLabel('密码').fill(session.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/admin/teachers');
}

export async function captureResponsiveEvidence(page: Page, name: string) {
  const directory = resolve('test-results/e2e/evidence');
  await mkdir(directory, { recursive: true });
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  for (const { width, height, label } of [
    { width: 1440, height: 900, label: '1440x900' },
    { width: 390, height: 844, label: '390x844' },
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(directory, `${name}-${label}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `${name} has no horizontal overflow at ${label}`).toBe(false);
  }
}

async function closeTestPage(page: Page) {
  if (!page.isClosed()) await page.context().close();
}

async function waitForDatabaseRequestsToSettle() {
  const deadline = Date.now() + 5000;
  let pending: Array<{ pid: number; state: string; wait_event: string | null; query: string }> = [];

  while (Date.now() < deadline) {
    const result = await pool.query<{ pid: number; state: string; wait_event: string | null; query: string }>(`
      select pid, state, wait_event, left(query, 160) as query
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and backend_type = 'client backend'
        and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')
        and query not ilike '%pg_stat_activity%'
    `);
    pending = result.rows;
    if (pending.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`E2E database still has in-flight requests after page close: ${JSON.stringify(pending)}`);
}

export async function removeTeacherSession(session: TeacherSession) {
  await db.transaction(async (tx) => {
    const [existingWin] = await tx.select({ id: winningRecords.id }).from(winningRecords)
      .where(eq(winningRecords.classId, session.classId)).limit(1);
    if (existingWin) return;

    await tx.delete(redemptionAudit).where(eq(redemptionAudit.classId, session.classId));
    await tx.delete(stockEvents).where(eq(stockEvents.classId, session.classId));
    const classSessions = await tx.select({ id: lotterySessions.id }).from(lotterySessions)
      .where(eq(lotterySessions.classId, session.classId));
    for (const row of classSessions) {
      await tx.delete(lotteryRounds).where(eq(lotteryRounds.sessionId, row.id));
      await tx.delete(sessionPrizes).where(eq(sessionPrizes.sessionId, row.id));
      await tx.delete(sessionStudents).where(eq(sessionStudents.sessionId, row.id));
    }
    await tx.delete(lotterySessions).where(eq(lotterySessions.classId, session.classId));
    await tx.delete(students).where(eq(students.classId, session.classId));
    await tx.delete(prizes).where(eq(prizes.classId, session.classId));
    await tx.delete(adminAudit).where(eq(adminAudit.classId, session.classId));
    await tx.delete(classTeachers).where(eq(classTeachers.classId, session.classId));
    await tx.delete(classes).where(eq(classes.id, session.classId));
    await tx.delete(user).where(eq(user.id, session.teacherId));
  });
}

async function seedAdminSession(): Promise<AdminSession> {
  const admin = await createIdentity('Task15 管理员', 'admin');
  const outsider = await createIdentity('Task15 未分配老师', 'user');
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, outsider.id));
  return { id: admin.id, email: admin.email, password: admin.password, outsiderId: outsider.id,
    outsiderEmail: outsider.email, outsiderPassword: outsider.password, createdTeacherIds: [], classIds: [] };
}

async function removeAdminSession(session: AdminSession) {
  await db.transaction(async (tx) => {
    for (const classId of session.classIds) {
      const [existingWin] = await tx.select({ id: winningRecords.id }).from(winningRecords)
        .where(eq(winningRecords.classId, classId)).limit(1);
      if (existingWin) continue;

      await tx.delete(redemptionAudit).where(eq(redemptionAudit.classId, classId));
      await tx.delete(stockEvents).where(eq(stockEvents.classId, classId));
      const sessionIds = await tx.select({ id: lotterySessions.id }).from(lotterySessions).where(eq(lotterySessions.classId, classId));
      for (const row of sessionIds) {
        await tx.delete(lotteryRounds).where(eq(lotteryRounds.sessionId, row.id));
        await tx.delete(sessionPrizes).where(eq(sessionPrizes.sessionId, row.id));
        await tx.delete(sessionStudents).where(eq(sessionStudents.sessionId, row.id));
      }
      await tx.delete(lotterySessions).where(eq(lotterySessions.classId, classId));
      await tx.delete(students).where(eq(students.classId, classId));
      await tx.delete(prizes).where(eq(prizes.classId, classId));
      await tx.delete(adminAudit).where(eq(adminAudit.classId, classId));
      await tx.delete(classTeachers).where(eq(classTeachers.classId, classId));
      await tx.delete(classes).where(eq(classes.id, classId));
    }
    await tx.delete(adminAudit).where(eq(adminAudit.actorId, session.id));
    await tx.delete(redemptionAudit).where(eq(redemptionAudit.actorId, session.id));
    await tx.delete(user).where(eq(user.id, session.outsiderId));
    await tx.delete(user).where(eq(user.id, session.id));
    for (const teacherId of session.createdTeacherIds) await tx.delete(user).where(eq(user.id, teacherId));
  });
}

export const test = base.extend<
  { teacherSession: TeacherSession; modeOneSession: TeacherSession; adminSession: AdminSession },
  { closeFixturePool: void }
>({
  closeFixturePool: [async ({}, use) => {
    await use();
    await pool.end();
  }, { scope: 'worker', auto: true }],
  teacherSession: async ({ page }, use) => {
    const session = await seedTeacherSession();
    try {
      // Playwright's fixture callback is unrelated to React hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await use(session);
    }
    finally {
      await closeTestPage(page);
      await waitForDatabaseRequestsToSettle();
      await removeTeacherSession(session);
    }
  },
  modeOneSession: async ({ page }, use) => {
    const session = await seedTeacherSession({ mode: 'student-prize', rounds: 3, studentCount: 3,
      studentDrawLimit: 2, prizeQuantity: 3 });
    try {
      // Playwright's fixture callback is unrelated to React hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await use(session);
    }
    finally {
      await closeTestPage(page);
      await waitForDatabaseRequestsToSettle();
      await removeTeacherSession(session);
    }
  },
  adminSession: async ({ page }, use) => {
    const session = await seedAdminSession();
    try {
      // Playwright's fixture callback is unrelated to React hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await use(session);
    }
    finally {
      await closeTestPage(page);
      await waitForDatabaseRequestsToSettle();
      await removeAdminSession(session);
    }
  },
});
export { expect };
