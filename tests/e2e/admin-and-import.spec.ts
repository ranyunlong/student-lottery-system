import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { user } from '../../src/db/auth-schema';
import { db } from '../../src/db/client';
import { adminAudit, classTeachers, classes, students } from '../../src/db/schema';
import { captureResponsiveEvidence, expect, loginAsAdmin, test } from './fixtures';
import { createFixturePassword } from '../e2e-support/runtime-env.mjs';

async function signOut(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL('**/login');
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

async function checkAdminWidths(page: import('@playwright/test').Page, currentNav: string) {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `horizontal overflow at ${width}px`)
      .toBeLessThanOrEqual(width);
    const link = page.getByRole('navigation', { name: '工作区' }).getByRole('link', { name: currentNav });
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(2);
  }
}

test('管理员可筛选并翻阅大量账号、班级和管理审计记录', async ({ page, adminSession }) => {
  test.setTimeout(120_000);
  const prefix = `分页${randomUUID().slice(0, 8)}`;
  const teacherRows = Array.from({ length: 23 }, (_, index) => ({
    id: randomUUID(), name: `${prefix}老师${String(index).padStart(2, '0')}`,
    email: `${randomUUID()}@pagination.example.test`, role: 'user', banned: false,
  }));
  const classRows = Array.from({ length: 23 }, (_, index) => ({
    id: randomUUID(), name: `${prefix}班级${String(index).padStart(2, '0')}`,
  }));
  await db.insert(user).values(teacherRows);
  adminSession.createdTeacherIds.push(...teacherRows.map((row) => row.id));
  await db.insert(classes).values(classRows);
  adminSession.classIds.push(...classRows.map((row) => row.id));
  await db.insert(adminAudit).values(Array.from({ length: 26 }, () => ({ actorId: adminSession.id, action: 'class.create' })));

  await loginAsAdmin(page, adminSession);
  await page.goto('/admin/teachers');
  await page.getByRole('searchbox', { name: '搜索姓名或邮箱' }).fill(prefix);
  await page.getByRole('button', { name: '筛选' }).click();
  const teacherTable = page.getByRole('table', { name: '老师账号列表' });
  await expect(teacherTable.locator('tbody > tr:not([hidden])')).toHaveCount(20);
  const teacherPager = page.getByRole('navigation', { name: '列表分页' });
  await teacherPager.getByRole('link', { name: '下一页' }).click();
  await expect(teacherTable.locator('tbody > tr:not([hidden])')).toHaveCount(3);
  await teacherPager.getByRole('link', { name: '上一页' }).click();
  await expect(teacherTable.locator('tbody > tr:not([hidden])')).toHaveCount(20);
  await checkAdminWidths(page, '老师账号');

  await page.goto('/admin/classes');
  await page.getByRole('searchbox', { name: '搜索班级名称' }).fill(prefix);
  await page.getByRole('button', { name: '筛选' }).click();
  const classTable = page.getByRole('table', { name: '班级列表' });
  await expect(classTable.locator('tbody > tr:not([hidden])')).toHaveCount(20);
  const classPager = page.getByRole('navigation', { name: '列表分页' });
  await classPager.getByRole('link', { name: '下一页' }).click();
  await expect(classTable.locator('tbody > tr:not([hidden])')).toHaveCount(3);
  await classPager.getByRole('link', { name: '上一页' }).click();
  await expect(classTable.locator('tbody > tr:not([hidden])')).toHaveCount(20);
  await checkAdminWidths(page, '班级管理');
  const classWidth = await classTable.evaluate((table) => table.getBoundingClientRect().width);
  const summaryWidth = await classTable.locator('tbody > tr').first().evaluate((row) => row.getBoundingClientRect().width);
  expect(Math.abs(classWidth - summaryWidth)).toBeLessThan(2);

  await page.goto('/admin/audit?view=management');
  await expect(page.getByRole('heading', { name: '审计记录' })).toBeVisible();
  const auditPager = page.getByRole('navigation', { name: '列表分页' });
  await expect(auditPager.getByRole('link', { name: '下一页' })).toBeVisible();
  await auditPager.getByRole('link', { name: '下一页' }).click();
  await expect(auditPager.getByRole('link', { name: '上一页' })).toBeVisible();
  await checkAdminWidths(page, '审计记录');
  await captureResponsiveEvidence(page, 'admin-audit-paged');
  const auditViews = page.getByRole('navigation', { name: '审计类型' });
  await auditViews.getByRole('link', { name: '兑换与纠错' }).click();
  await expect(auditViews.getByRole('link', { name: '兑换与纠错' })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/view=redemptions/);
  await checkAdminWidths(page, '审计记录');
  await captureResponsiveEvidence(page, 'admin-audit-redemptions');
  await page.getByLabel('按中奖记录 ID 定位').fill(randomUUID());
  await page.getByRole('button', { name: '查找' }).click();
  await expect(page.getByText('未找到当前已兑的中奖记录。')).toBeVisible();
});

test('管理员建号分配班级，老师导入学生并只允许授权班级访问', async ({ page, adminSession }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page, adminSession);
  await page.goto('/admin/teachers');
  await captureResponsiveEvidence(page, 'admin');

  const teachers = ['甲', '乙', '丙'].map((suffix) => ({
    name: `Task15 老师${suffix} ${randomUUID().slice(0, 6)}`,
    email: `${randomUUID()}@task15.example.test`,
  }));
  const teacherTemporaryPasswords = teachers.map(() => createFixturePassword());
  for (const [index, teacher] of teachers.entries()) {
    await page.getByRole('button', { name: '创建老师' }).click();
    const createTeacherForm = page.getByRole('dialog', { name: '创建老师' }).locator('form');
    await createTeacherForm.locator('input[name="name"]').fill(teacher.name);
    await createTeacherForm.locator('input[name="email"]').fill(teacher.email);
    await createTeacherForm.locator('input[name="temporaryPassword"]').fill(teacherTemporaryPasswords[index]);
    await createTeacherForm.getByRole('button', { name: '创建账号' }).click();
    await expect(page.getByRole('dialog', { name: '创建老师' })).not.toBeVisible();
  }
  const teacherIds = [] as string[];
  for (const teacher of teachers) {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, teacher.email));
    expect(row?.id).toBeTruthy();
    teacherIds.push(row.id);
    adminSession.createdTeacherIds.push(row.id);
  }

  const className = `Task15 E2E ${randomUUID().slice(0, 8)}`;
  await page.goto('/admin/classes');
  await expect(page.getByRole('heading', { name: '最近管理记录' })).toHaveCount(0);
  await page.getByRole('button', { name: '创建班级' }).click();
  const createClassForm = page.getByRole('dialog', { name: '创建班级' }).locator('form');
  await createClassForm.locator('input[name="name"]').fill(className);
  await createClassForm.getByRole('button', { name: '创建班级' }).click();
  await expect(page.getByRole('dialog', { name: '创建班级' })).not.toBeVisible();
  const [classRow] = await db.select({ id: classes.id }).from(classes).where(eq(classes.name, className));
  expect(classRow?.id).toBeTruthy();
  const classId = classRow.id;
  adminSession.classIds.push(classId);

  const classItem = page.getByRole('table', { name: '班级列表' }).locator('tbody > tr')
    .filter({ has: page.getByText(className, { exact: true }) }).first();
  const editTrigger = classItem.getByRole('button', { name: `编辑班级${className}` });
  const editTitle = `编辑班级：${className}`;
  const openClassEditor = async () => {
    await editTrigger.click();
    const dialog = page.getByRole('dialog', { name: editTitle });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const chooseTeacher = async (dialog: import('@playwright/test').Locator,
    teacher: { name: string; email: string }, actionName: string) => {
    const section = dialog.getByRole('region', { name: '老师配置' });
    const search = section.getByRole('searchbox', { name: '搜索老师' });
    await search.fill(teacher.email);
    const candidate = section.locator('li').filter({ hasText: teacher.email }).first();
    await expect(candidate).toBeVisible();
    await candidate.getByRole('button', { name: actionName, exact: true }).click();
    await search.fill('');
  };

  let editDialog = await openClassEditor();
  await expect(editDialog.getByLabel('班级名称')).toBeFocused();
  await chooseTeacher(editDialog, teachers[0], '设为主负责人');
  await chooseTeacher(editDialog, teachers[1], '分配任课');
  await chooseTeacher(editDialog, teachers[2], '分配任课');
  await chooseTeacher(editDialog, teachers[1], '设为主负责人');
  await editDialog.getByRole('button', { name: '保存班级设置' }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(editTrigger).toBeFocused();

  const membershipRows = await db.select({ teacherId: classTeachers.teacherId, role: classTeachers.role })
    .from(classTeachers).where(eq(classTeachers.classId, classId));
  expect(membershipRows.map(({ teacherId, role }) => ({ teacherId, role })).sort((a, b) => a.teacherId.localeCompare(b.teacherId)))
    .toEqual([
      { teacherId: teacherIds[0], role: 'teaching' },
      { teacherId: teacherIds[1], role: 'primary' },
      { teacherId: teacherIds[2], role: 'teaching' },
    ].sort((a, b) => a.teacherId.localeCompare(b.teacherId)));
  const teacherCell = classItem.locator('td').nth(1);
  const primaryAssignment = teacherCell.locator('p').filter({ hasText: '主负责人' });
  const teachingAssignments = teacherCell.locator('p').filter({ hasText: '任课' });
  await expect(primaryAssignment).toHaveCount(1);
  await expect(primaryAssignment).toContainText(teachers[1].name);
  await expect(teachingAssignments).toHaveCount(1);
  await expect(teachingAssignments).toContainText(teachers[0].name);
  await expect(teachingAssignments).toContainText(teachers[2].name);
  await expect(teachingAssignments).not.toContainText(teachers[1].name);

  editDialog = await openClassEditor();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `class editor overflow at ${width}px`)
      .toBeLessThanOrEqual(width);
    const search = editDialog.getByRole('region', { name: '老师配置' }).getByRole('searchbox', { name: '搜索老师' });
    await search.focus();
    await expect(search).toBeFocused();
    expect(await search.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(2);
  }
  await captureResponsiveEvidence(page, 'admin-class-edit');
  await page.keyboard.press('Escape');
  await expect(editDialog).not.toBeVisible();
  await expect(editTrigger).toBeFocused();

  editDialog = await openClassEditor();
  const emblem = Buffer.from(await sharp({ create: { width: 32, height: 24, channels: 4,
    background: { r: 18, g: 125, b: 111, alpha: 1 } } }).png().toBuffer());
  await editDialog.locator('input[type="file"][name="emblemFile"]').setInputFiles({ name: 'task15-emblem.png', mimeType: 'image/png', buffer: emblem });
  await editDialog.getByRole('button', { name: '保存班级设置' }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(editTrigger).toBeFocused();
  const emblemImage = classItem.getByRole('img', { name: `${className}班徽` });
  await expect.poll(() => emblemImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(32);
  expect(await emblemImage.evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(24);
  await captureResponsiveEvidence(page, 'admin-classes');

  const directEmblem = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, type: response.headers.get('content-type') };
  }, `/api/classes/${classId}/emblem`);
  expect(directEmblem).toEqual({ status: 200, type: 'image/png' });

  await signOut(page);
  await login(page, teachers[0].email, teacherTemporaryPasswords[0]);
  await page.waitForURL('**/change-password');
  const changedPassword = createFixturePassword();
  await page.getByLabel('当前密码').fill(teacherTemporaryPasswords[0]);
  await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
  await page.getByLabel('确认新密码').fill(changedPassword);
  await page.getByRole('button', { name: '修改密码' }).click();
  await page.waitForURL('**/teacher');
  await expect(page.getByRole('link', { name: '学生名单' })).toBeVisible();

  await signOut(page);
  await login(page, adminSession.outsiderEmail, adminSession.outsiderPassword);
  await page.waitForURL('**/teacher');
  const denied = await page.evaluate(async (url) => {
    const response = await fetch(url, { method: 'POST', body: new FormData() });
    return response.status;
  }, `/api/classes/${classId}/students/import`);
  expect(denied).toBe(403);
  const deniedTemplate = await page.request.get(`/api/classes/${classId}/students/import`);
  expect(deniedTemplate.status()).toBe(403);

  await signOut(page);
  await login(page, teachers[0].email, changedPassword);
  await page.waitForURL('**/teacher');
  const rosterResponse = await page.goto(`/classes/${classId}/students`);
  expect(rosterResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /· 学生$/ })).toBeVisible();
  await page.getByRole('button', { name: '导入学生' }).click();
  const importDialog = page.getByRole('dialog', { name: '导入学生' });
  await expect(importDialog).toBeVisible();
  await expect(importDialog.getByRole('tablist', { name: '导入方式' })).toBeVisible();
  const pasteTab = importDialog.getByRole('tab', { name: '粘贴导入' });
  await importDialog.getByRole('tab', { name: 'Excel 文件' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(pasteTab).toBeFocused();
  await expect(pasteTab).toHaveAttribute('aria-selected', 'true');
  await importDialog.getByLabel('粘贴学生数据').fill('001\t王甲\t男\n002\t王乙\t女');
  await importDialog.getByRole('button', { name: '预览名单' }).click();
  await expect(importDialog.getByText('2 条有效，0 项错误')).toBeVisible();
  await importDialog.getByRole('button', { name: '确认导入' }).click();
  await expect(importDialog.getByText('导入完成：新增 2，更新 0')).toBeVisible();
  const [original] = await db.select().from(students).where(eq(students.classId, classId)).orderBy(students.id);
  expect(original.studentNumber).toBe('001');
  const originalId = original.id;

  await importDialog.getByRole('tab', { name: 'Excel 文件' }).click();
  const downloadPromise = page.waitForEvent('download');
  await importDialog.getByRole('link', { name: '下载 Excel 模板' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('学生导入模板.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(await download.createReadStream());
  expect(workbook.worksheets).toHaveLength(1);
  const sheet = workbook.worksheets[0];
  expect(sheet.getRow(1).values).toEqual([undefined, '学号', '姓名', '性别']);
  expect(sheet.getColumn(1).numFmt).toBe('@');
  expect(sheet.actualRowCount).toBe(1);
  sheet.addRow(['001', '王甲更新', '女']);
  sheet.addRow(['003', '王丙', '男']);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  await importDialog.getByRole('tab', { name: 'Excel 文件' }).click();
  await importDialog.getByLabel('选择 Excel 文件').setInputFiles({ name: 'students.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  const excelPreviewResponse = page.waitForResponse((response) => response.url().includes(`/api/classes/${classId}/students/import`)
    && response.request().method() === 'POST');
  await importDialog.getByRole('button', { name: '预览名单' }).click();
  const previewResponse = await excelPreviewResponse;
  const previewHeaders = await previewResponse.request().allHeaders();
  const previewBody = await previewResponse.text();
  expect(previewResponse.status(), JSON.stringify({ url: previewResponse.url(), origin: previewHeaders.origin,
    host: previewHeaders.host, body: previewBody })).toBe(200);
  await expect(importDialog.getByText('2 条有效，0 项错误')).toBeVisible();
  await importDialog.getByRole('button', { name: '确认导入' }).click();
  await expect(importDialog.getByText('导入完成：新增 1，更新 1')).toBeVisible();
  const [updated] = await db.select().from(students).where(eq(students.classId, classId)).orderBy(students.id);
  expect(updated.id).toBe(originalId);
  expect(updated.name).toBe('王甲更新');
  await captureResponsiveEvidence(page, 'import');

  await importDialog.getByRole('tab', { name: '粘贴导入' }).click();
  await importDialog.getByLabel('粘贴学生数据').fill('004\t重复甲\t男\n004\t重复乙\t女');
  await importDialog.getByRole('button', { name: '预览名单' }).click();
  await expect(importDialog.getByRole('heading', { name: '预览 1 条有效，1 项错误' })).toBeVisible();
  await expect(importDialog.getByRole('button', { name: '确认导入' })).toBeDisabled();
  expect(await db.select().from(students).where(eq(students.classId, classId))).toHaveLength(3);

  await db.insert(students).values(Array.from({ length: 52 }, (_, index) => ({
    classId, studentNumber: String(index + 100).padStart(3, '0'), name: `Roster Student ${index + 1}`,
  })));
  await page.reload();
  await page.setViewportSize({ width: 375, height: 812 });
  const pager = page.getByRole('navigation', { name: '名单分页' });
  const nextPage = pager.getByRole('button', { name: '下一页' });
  await nextPage.focus();
  await expect(nextPage).toBeFocused();
  const targetHeight = await nextPage.evaluate((element) => element.getBoundingClientRect().height);
  expect(targetHeight).toBeGreaterThanOrEqual(40);
  const focusOutlineWidth = await nextPage.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth));
  expect(focusOutlineWidth).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
  await expect(pager.getByText('2 / 2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const directory = resolve('test-results/e2e/evidence');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, 'roster-375px.png'), fullPage: true });
});
