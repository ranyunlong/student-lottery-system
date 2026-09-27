import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { user } from '../../src/db/auth-schema';
import { db } from '../../src/db/client';
import { classTeachers, classes, students } from '../../src/db/schema';
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

test('管理员建号分配班级，老师导入学生并只允许授权班级访问', async ({ page, adminSession }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page, adminSession);
  await page.goto('/admin/teachers');
  await captureResponsiveEvidence(page, 'admin');

  const firstTeacher = { name: `Task15 老师甲 ${randomUUID().slice(0, 6)}`, email: `${randomUUID()}@task15.example.test` };
  const secondTeacher = { name: `Task15 老师乙 ${randomUUID().slice(0, 6)}`, email: `${randomUUID()}@task15.example.test` };
  const teacherTemporaryPasswords = [createFixturePassword(), createFixturePassword()];
  const createTeacherForm = page.getByRole('heading', { name: '创建老师' }).locator('..').locator('form');
  for (const [index, teacher] of [firstTeacher, secondTeacher].entries()) {
    await createTeacherForm.locator('input[name="name"]').fill(teacher.name);
    await createTeacherForm.locator('input[name="email"]').fill(teacher.email);
    await createTeacherForm.locator('input[name="temporaryPassword"]').fill(teacherTemporaryPasswords[index]);
    await page.getByRole('button', { name: '创建账号' }).click();
    await expect(page.getByText('老师账号已创建')).toBeVisible();
  }
  const teacherIds = [] as string[];
  for (const teacher of [firstTeacher, secondTeacher]) {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, teacher.email));
    expect(row?.id).toBeTruthy();
    teacherIds.push(row.id);
    adminSession.createdTeacherIds.push(row.id);
  }

  const className = `Task15 E2E ${randomUUID().slice(0, 8)}`;
  await page.goto('/admin/classes');
  const createClassForm = page.getByRole('heading', { name: '创建班级' }).locator('..').locator('form');
  await createClassForm.locator('input[name="name"]').fill(className);
  await page.getByRole('button', { name: '创建班级' }).click();
  await expect(page.getByText('班级已创建')).toBeVisible();
  const [classRow] = await db.select({ id: classes.id }).from(classes).where(eq(classes.name, className));
  expect(classRow?.id).toBeTruthy();
  const classId = classRow.id;
  adminSession.classIds.push(classId);

  const classItem = page.getByRole('listitem').filter({ hasText: className });
  for (let index = 0; index < teacherIds.length; index++) {
    await classItem.getByLabel('选择老师').selectOption(teacherIds[index]);
    await classItem.getByRole('button', { name: '分配老师' }).click();
    await expect(classItem.getByText('老师已分配').last()).toBeVisible();
  }
  expect(await db.select().from(classTeachers).where(eq(classTeachers.classId, classId))).toHaveLength(2);

  const emblem = Buffer.from(await sharp({ create: { width: 32, height: 24, channels: 4,
    background: { r: 18, g: 125, b: 111, alpha: 1 } } }).png().toBuffer());
  await classItem.getByLabel('上传班徽').setInputFiles({ name: 'task15-emblem.png', mimeType: 'image/png', buffer: emblem });
  await classItem.getByRole('button', { name: '更新班徽' }).click();
  await expect(page.getByText('班徽已更新')).toBeVisible();
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
  await login(page, firstTeacher.email, teacherTemporaryPasswords[0]);
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

  await signOut(page);
  await login(page, firstTeacher.email, changedPassword);
  await page.waitForURL('**/teacher');
  const rosterResponse = await page.goto(`/classes/${classId}/students`);
  expect(rosterResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /· 学生$/ })).toBeVisible();
  await expect(page.getByRole('tablist', { name: '导入方式' })).toBeVisible();
  const pasteTab = page.getByRole('tab', { name: '粘贴导入' });
  await page.getByRole('tab', { name: 'Excel 文件' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(pasteTab).toBeFocused();
  await expect(pasteTab).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('粘贴学生数据').fill('001\t王甲\t男\n002\t王乙\t女');
  await page.getByRole('button', { name: '预览名单' }).click();
  await expect(page.getByText('2 条有效，0 项错误')).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('导入完成：新增 2，更新 0')).toBeVisible();
  const [original] = await db.select().from(students).where(eq(students.classId, classId)).orderBy(students.id);
  expect(original.studentNumber).toBe('001');
  const originalId = original.id;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('学生');
  sheet.addRow(['学号', '姓名', '性别']);
  sheet.addRow(['001', '王甲更新', '女']);
  sheet.addRow(['003', '王丙', '男']);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.getByRole('tab', { name: 'Excel 文件' }).click();
  await page.getByLabel('选择 Excel 文件').setInputFiles({ name: 'students.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  const excelPreviewResponse = page.waitForResponse((response) => response.url().includes(`/api/classes/${classId}/students/import`)
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: '预览名单' }).click();
  const previewResponse = await excelPreviewResponse;
  const previewHeaders = await previewResponse.request().allHeaders();
  const previewBody = await previewResponse.text();
  expect(previewResponse.status(), JSON.stringify({ url: previewResponse.url(), origin: previewHeaders.origin,
    host: previewHeaders.host, body: previewBody })).toBe(200);
  await expect(page.getByText('2 条有效，0 项错误')).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('导入完成：新增 1，更新 1')).toBeVisible();
  const [updated] = await db.select().from(students).where(eq(students.classId, classId)).orderBy(students.id);
  expect(updated.id).toBe(originalId);
  expect(updated.name).toBe('王甲更新');
  await captureResponsiveEvidence(page, 'import');

  await page.getByRole('tab', { name: '粘贴导入' }).click();
  await page.getByLabel('粘贴学生数据').fill('004\t重复甲\t男\n004\t重复乙\t女');
  await page.getByRole('button', { name: '预览名单' }).click();
  await expect(page.getByRole('heading', { name: '预览 1 条有效，1 项错误' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认导入' })).toBeDisabled();
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
