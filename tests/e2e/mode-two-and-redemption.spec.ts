import { eq } from 'drizzle-orm';
import { test, expect, captureResponsiveEvidence, loginAsAdmin, loginAsTeacher } from './fixtures';
import { db, pool } from '../../src/db/client';
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
  await expect(page.getByRole('heading', { name: '本场中奖记录' })).toBeVisible();
  await expect(page.getByRole('region', { name: '本场中奖记录' }).getByRole('row')).toHaveCount(4);

  await page.getByRole('link', { name: '退出现场抽奖' }).click();
  await page.getByRole('link', { name: '中奖与兑换', exact: true }).click();
  const winningsTable = page.getByRole('table', { name: '中奖记录' });
  await expect(winningsTable).toBeVisible();
  await captureResponsiveEvidence(page, 'winnings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '标记已兑换' }).first().click();
  await expect(page.getByText('已标记兑换')).toBeVisible();
  await page.getByRole('link', { name: /已兑/ }).click();
  const redeemedWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  const redeemed = redeemedWins.filter((win) => win.redemptionStatus === 'redeemed');
  expect(redeemed).toHaveLength(1);
  await expect(winningsTable.getByRole('row').filter({ hasText: redeemed[0].studentNameSnapshot })).toBeVisible();
  expect(await db.select().from(stockEvents).where(eq(stockEvents.prizeId, teacherSession.prizeId))).toHaveLength(3);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(teacherSession.initialStock - 3);

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login');
  await loginAsAdmin(page, adminSession);
  await page.goto('/admin/audit?view=management');
  const auditViews = page.getByRole('navigation', { name: '审计类型' });
  await expect(auditViews.getByRole('link', { name: '管理操作' })).toHaveAttribute('aria-current', 'page');
  await auditViews.getByRole('link', { name: '兑换与纠错' }).click();
  await expect(auditViews.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/view=redemptions/);
  await captureResponsiveEvidence(page, 'admin-audit-redemptions-with-record');
  const redeemedAuditRow = page.getByRole('table', { name: '兑换与纠错记录' }).getByRole('row')
    .filter({ hasText: redeemed[0].studentNameSnapshot })
    .filter({ hasText: redeemed[0].prizeNameSnapshot });
  await redeemedAuditRow.getByRole('link', { name: '定位纠错' }).click();
  await expect(page).toHaveURL(new RegExp(`view=redemptions&winId=${redeemed[0].id}`));
  await expect(page.getByLabel('按中奖记录 ID 定位')).toHaveValue(redeemed[0].id);
  await expect(page.getByLabel('纠错原因')).toBeVisible();
  await captureResponsiveEvidence(page, 'admin-audit-correction');
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
  const cancelDialog = page.getByRole('dialog', { name: '确认取消本轮抽奖？' });
  await expect(cancelDialog).toBeVisible();
  await cancelDialog.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消轮次', exact: true }).click();
  await cancelDialog.getByRole('button', { name: '确认取消轮次', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: '本场中奖记录' })).toBeVisible();
  await expect(page.getByRole('region', { name: '本场中奖记录' }).getByRole('row')).toHaveCount(2);
  expect((await db.select().from(prizes).where(eq(prizes.id, teacherSession.prizeId)))[0].stock).toBe(0);
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId))).toHaveLength(1);
});

test('受限 runner 保持中奖记录 trigger 启用且不可删除历史结果', async ({ page, teacherSession }) => {
  await loginAsTeacher(page, teacherSession);
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('中奖结果已由服务端确认并保存。')).toBeVisible();

  const trigger = await pool.query<{ tgenabled: string }>(`
    select tgenabled from pg_trigger
    where tgrelid = 'public.winning_records'::regclass
      and tgname = 'protect_winning_record_trigger'
  `);
  expect(trigger.rows).toEqual([{ tgenabled: 'O' }]);
  const [win] = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, teacherSession.sessionId));
  await expect(pool.query('delete from winning_records where id = $1', [win.id]))
    .rejects.toThrow(/winning records cannot be deleted/i);
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
  await expect(page.getByRole('heading', { name: '本场中奖记录' })).toBeVisible();

  await page.getByRole('link', { name: '退出现场抽奖' }).click();
  await page.getByRole('link', { name: '中奖与兑换', exact: true }).click();
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
  await page.getByRole('button', { name: '添加全部匹配学生' }).click();
  await page.getByRole('button', { name: /^添加 Task15 奖品/ }).click();
  await page.getByLabel('抽取轮数').fill('1');
  await page.getByRole('button', { name: '创建并进入现场抽奖' }).click();
  await expect(page).toHaveURL(new RegExp(`/classes/${teacherSession.classId}/lotteries/[^/]+$`));
  await expect(page.getByText('可用学生 3 人')).toBeVisible();
  const newSessionId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: '开始抽奖' }).click();
  expect(await db.select().from(winningRecords).where(eq(winningRecords.sessionId, newSessionId))).toHaveLength(0);
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByRole('heading', { name: '本场中奖记录' })).toBeVisible();
  const newSessionWins = await db.select().from(winningRecords).where(eq(winningRecords.sessionId, newSessionId));
  expect(newSessionWins).toHaveLength(1);
  expect(teacherSession.studentIds).toContain(newSessionWins[0].studentId);
});
