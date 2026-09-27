import { eq } from 'drizzle-orm';
import { test, expect, captureResponsiveEvidence, loginAsTeacher } from './fixtures';
import { db } from '../../src/db/client';
import { lotterySessions, prizes, sessionPrizes, sessionStudents, winningRecords } from '../../src/db/schema';

test('保存新建场次草稿后返回场次列表', async ({ page, teacherSession }) => {
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries`);
  await page.getByRole('link', { name: '新建场次' }).click();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('checkbox').nth(3).check();
  await page.getByLabel('每人最多抽取次数').fill('2');
  await page.getByLabel('本场数量').fill('2');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page).toHaveURL(new RegExp(`/classes/${teacherSession.classId}/lotteries$`));
  await expect(page.getByText('草稿', { exact: true })).toBeVisible();
  expect(await db.select().from(lotterySessions).where(eq(lotterySessions.classId, teacherSession.classId))).toHaveLength(2);
});

test('模式一在刷新后恢复选中学生并执行每人次数、奖品配额和库存限制', async ({ page, modeOneSession }) => {
  const studentId = modeOneSession.studentIds[0];
  await loginAsTeacher(page, modeOneSession);
  await page.goto(`/classes/${modeOneSession.classId}/lotteries/${modeOneSession.sessionId}`);
  await expect(page.getByRole('heading', { name: '指定学生 · 随机奖品' })).toBeVisible();
  await captureResponsiveEvidence(page, 'mode-one-live');

  const studentSelect = page.getByLabel('本轮学生');
  await studentSelect.selectOption(String(studentId));
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await expect(page.getByText('抽奖进行中')).toBeVisible();
  const pending = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, modeOneSession.sessionId));
  expect(pending).toHaveLength(0);
  expect((await db.select().from(prizes).where(eq(prizes.id, modeOneSession.prizeId)))[0].stock).toBe(modeOneSession.initialStock);

  await page.reload();
  await expect(page.getByText('已恢复进行中的轮次')).toBeVisible();
  await expect(page.getByLabel('本轮学生')).toHaveValue(String(studentId));
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  const rounds = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, modeOneSession.sessionId));
  expect(rounds).toHaveLength(1);
  expect(rounds[0].studentId).toBe(studentId);
  await expect(page.getByText(/^剩余次数\s*2$/)).toBeVisible();
  await page.getByRole('button', { name: '下一轮' }).click();
  await page.getByLabel('本轮学生').selectOption(String(studentId));
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  await expect(page.getByText(/^剩余次数\s*1$/)).toBeVisible();
  await expect(page.getByLabel('本轮学生').locator(`option[value="${studentId}"]`)).toHaveAttribute('disabled', '');
  await expect(page.getByRole('button', { name: '下一轮' })).toBeVisible();

  await page.getByRole('button', { name: '下一轮' }).click();
  await expect.poll(() => studentSelect.inputValue()).not.toBe(String(studentId));
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  await expect(page.getByText(/^剩余次数\s*0$/)).toBeVisible();

  const wins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, modeOneSession.sessionId));
  expect(wins).toHaveLength(3);
  expect(wins.every((win) => modeOneSession.studentIds.includes(win.studentId))).toBe(true);
  const perStudent = new Map<number, number>();
  for (const win of wins) perStudent.set(win.studentId, (perStudent.get(win.studentId) ?? 0) + 1);
  expect([...perStudent.values()].every((count) => count <= 2)).toBe(true);
  expect((await db.select().from(sessionStudents).where(eq(sessionStudents.sessionId, modeOneSession.sessionId)))
    .reduce((sum, row) => sum + row.usedCount, 0)).toBe(3);
  expect((await db.select().from(sessionPrizes).where(eq(sessionPrizes.sessionId, modeOneSession.sessionId)))[0].usedCount).toBe(3);
  expect((await db.select().from(prizes).where(eq(prizes.id, modeOneSession.prizeId)))[0].stock).toBe(modeOneSession.initialStock - 3);
  await expect(page.getByRole('button', { name: '下一轮' })).not.toBeVisible();
});
