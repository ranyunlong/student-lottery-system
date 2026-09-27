import { eq } from 'drizzle-orm';
import { test, expect, captureResponsiveEvidence, loginAsAdmin, loginAsTeacher } from './fixtures';
import { db } from '../../src/db/client';
import { prizes, redemptionAudit, stockEvents, winningRecords } from '../../src/db/schema';

test('模式二连续抽取并可兑换、纠正已持久化中奖记录', async ({ page, teacherSession, adminSession }) => {
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);
  await expect(page.getByRole('heading', { name: '指定奖品 · 随机学生' })).toBeVisible();

  await page.getByRole('button', { name: '开始抽奖' }).click();
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId))).toHaveLength(0);
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  const firstWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(firstWins).toHaveLength(1);
  expect(new Set(firstWins.map((win) => win.studentId)).size).toBe(firstWins.length);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock - 1);
  await expect(page.getByText(/^剩余次数\s*2$/)).toBeVisible();
  await expect(page.getByText(/^固定奖品库存\s*3$/)).toBeVisible();
  await captureResponsiveEvidence(page, 'mode-two-live');

  await expect(page.getByRole('button', { name: '下一轮' })).toBeVisible();
  await page.getByRole('button', { name: '下一轮' }).click();
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  const allWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(allWins).toHaveLength(2);
  expect(new Set(allWins.map((win) => win.studentId)).size).toBe(2);
  await expect(page.getByText(/^剩余次数\s*1$/)).toBeVisible();
  await expect(page.getByText(/^固定奖品库存\s*2$/)).toBeVisible();

  await page.getByRole('button', { name: '下一轮' }).click();
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  const finalWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(finalWins).toHaveLength(3);
  expect(new Set(finalWins.map((win) => win.studentId)).size).toBe(finalWins.length);
  await expect(page.getByText(/^剩余次数\s*0$/)).toBeVisible();
  await expect(page.getByRole('button', { name: '下一轮' })).not.toBeVisible();

  await page.getByRole('link', { name: '查看中奖记录' }).click();
  await expect(page.getByRole('heading', { name: /中奖历史/ })).toBeVisible();
  await captureResponsiveEvidence(page, 'winnings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '标记已兑换' }).first().click();
  await expect(page.getByText('已标记兑换')).toBeVisible();
  await page.getByRole('link', { name: /已兑/ }).click();
  const redeemedWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  const redeemed = redeemedWins.filter((win) => win.redemptionStatus === 'redeemed');
  expect(redeemed).toHaveLength(1);
  await expect(page.getByRole('listitem').filter({ hasText: redeemed[0].studentNameSnapshot })).toBeVisible();
  expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, teacherSession.prizeId))).toHaveLength(3);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock - 3);

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login');
  await loginAsAdmin(page, adminSession);
  await page.goto(`/admin/audit?winId=${redeemed[0].id}`);
  await page.getByLabel('纠错原因').fill('重复点击导致误标，核对后恢复待兑换');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '纠正误标' }).click();
  await expect(page.getByText('已纠正兑换状态')).toBeVisible();
  const [corrected] = await db.select().from(winningRecords).where(eq(winningRecords.id, redeemed[0].id));
  expect(corrected.redemptionStatus).toBe('pending');
  expect(await db.select().from(redemptionAudit).where(eq(redemptionAudit.winningRecordId, redeemed[0].id)))
    .toEqual(expect.arrayContaining([expect.objectContaining({ newStatus: 'pending', reason: '重复点击导致误标，核对后恢复待兑换' })]));
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock - 3);
});

test('取消不产生结果，停止响应丢失后使用同一令牌重试不会重复扣库存', async ({ page, teacherSession }) => {
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);

  await page.getByRole('button', { name: '开始抽奖' }).click();
  const activeRounds = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(activeRounds).toHaveLength(0);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock);
  await page.getByRole('button', { name: '取消轮次' }).click();
  await expect(page.getByRole('button', { name: '开始抽奖' })).toBeVisible();
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId))).toHaveLength(0);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, teacherSession.prizeId))).toHaveLength(0);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock);

  await page.getByRole('button', { name: '开始抽奖' }).click();
  let loseFirstResponse = true;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (loseFirstResponse && request.method() === 'POST' && request.headers()['next-action']) {
      const response = await route.fetch();
      loseFirstResponse = false;
      await route.abort('failed');
      expect(response.ok()).toBe(true);
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByRole('button', { name: '重试停止' })).toBeVisible();
  await page.getByRole('button', { name: '重试停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  await page.unrouteAll();

  const wins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(wins).toHaveLength(1);
  expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, teacherSession.prizeId))).toHaveLength(1);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock - 1);
});

test('库存耗尽后不能开始下一轮', async ({ page, teacherSession }) => {
  await db.update(prizes).set({ stock: 1 }).where(eq(prizes.id, teacherSession.prizeId));
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);
  await expect(page.getByText(/^固定奖品库存\s*1$/)).toBeVisible();
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('奖品库存已耗尽')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一轮' })).not.toBeVisible();
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(0);
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId))).toHaveLength(1);
});

test('同一学生在新的真实场次重新具备候选资格', async ({ page, teacherSession }) => {
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  await page.getByRole('button', { name: '下一轮' }).click();
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  await page.getByRole('button', { name: '下一轮' }).click();
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('奖品库存已耗尽')).toBeVisible();

  await page.getByRole('link', { name: '查看中奖记录' }).click();
  const pendingCount = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  expect(pendingCount).toHaveLength(3);
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login');
  await page.getByLabel('邮箱').fill(teacherSession.email);
  await page.getByLabel('密码').fill(teacherSession.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/teacher');
  await page.goto(`/classes/${teacherSession.classId}/lotteries`);
  await page.getByRole('link', { name: '新建场次' }).click();
  await page.getByRole('link', { name: '指定奖品 · 随机学生' }).click();
  for (let index = 0; index < teacherSession.studentIds.length; index++) await page.getByRole('checkbox').nth(index).check();
  await page.getByLabel('固定奖品').selectOption(teacherSession.prizeId);
  await page.getByLabel('抽取轮数').fill('1');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page).toHaveURL(new RegExp(`/classes/${teacherSession.classId}/lotteries$`));
  const newDraft = page.getByRole('listitem').filter({ hasText: '抽取 1 轮' });
  await newDraft.getByRole('button', { name: '开始场次' }).click();
  await expect(newDraft.getByText('进行中')).toBeVisible();
  await newDraft.getByRole('link', { name: '进入现场抽奖' }).click();
  await expect(page.getByText('可用学生 3 人')).toBeVisible();
  const newSessionId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: '开始抽奖' }).click();
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, newSessionId))).toHaveLength(0);
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();
  const newSessionWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, newSessionId));
  expect(newSessionWins).toHaveLength(1);
  expect(teacherSession.studentIds).toContain(newSessionWins[0].studentId);
});
