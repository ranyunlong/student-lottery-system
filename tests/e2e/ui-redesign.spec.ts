import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, loginAsAdmin, test } from './fixtures';

const widths = [1440, 320, 375, 414, 768, 1024];

async function capturePage(page: Page, name: string) {
  const directory = resolve('test-results/ui-redesign');
  await mkdir(directory, { recursive: true });
  await page.locator('main').waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(dimensions.document, `${name}: document overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body, `${name}: body overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    const audit = await page.evaluate(() => {
      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse'
          && style.display !== 'none' && Number(style.opacity) !== 0
          && !element.closest('[hidden], [aria-hidden="true"], .sr-only');
      };
      const images = Array.from(document.querySelectorAll('main img')).filter(visible);
      const controls = Array.from(document.querySelectorAll('main button, main input, main select, main textarea'))
        .filter(visible);
      const controlName = (element: Element) => {
        const labels = 'labels' in element ? Array.from((element as HTMLInputElement).labels ?? []) : [];
        const label = labels.map((item) => item.textContent?.trim()).filter(Boolean).join(' / ');
        const name = element.getAttribute('aria-label') || label || element.textContent?.trim()
          || element.getAttribute('title') || '';
        const type = element instanceof HTMLInputElement ? ` type=${element.type}` : '';
        return `${element.tagName.toLowerCase()}${type}${name ? ` "${name}"` : ''}`;
      };
      const unnamedControls = controls.filter((element) => {
        const labels = 'labels' in element ? (element as HTMLInputElement).labels : null;
        const hasLabel = Array.from(labels ?? []).some((label) => label.textContent?.trim());
        const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/)
          .some((id) => document.getElementById(id)?.textContent?.trim());
        return !hasLabel && !labelledBy && !element.getAttribute('aria-label') && !element.textContent?.trim() && !element.getAttribute('title');
      }).map(controlName);
      const clippedControls = controls.flatMap((control) => {
        const rect = control.getBoundingClientRect();
        const clippedBy: string[] = [];
        if (rect.left < -1 || rect.right > window.innerWidth + 1) clippedBy.push('viewport');
        for (let ancestor = control.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (!['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) continue;
          const bounds = ancestor.getBoundingClientRect();
          const left = bounds.left + ancestor.clientLeft;
          const right = left + ancestor.clientWidth;
          if (rect.left < left - 1 || rect.right > right + 1) {
            clippedBy.push(`${ancestor.tagName.toLowerCase()}${ancestor.id ? `#${ancestor.id}` : ''}[overflow-x:${style.overflowX}]`);
          }
        }
        return clippedBy.length ? [{ control: controlName(control), clippedBy }] : [];
      });
      const undersizedTargets = controls.flatMap((control) => {
        const isChoice = control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type);
        const targets: Element[] = isChoice
          ? Array.from(control.labels ?? []).filter(visible)
          : control.matches('button, input, select, textarea, summary') ? [control] : [];
        if (isChoice && !targets.length) targets.push(control);
        if (!targets.length) return [];
        const height = Math.max(...targets.map((target) => target.getBoundingClientRect().height));
        return height < 40 ? [{ control: controlName(control), targetHeight: Math.round(height * 10) / 10 }] : [];
      });
      const summaries = Array.from(document.querySelectorAll('main summary')).filter(visible);
      for (const summary of summaries) {
        const height = summary.getBoundingClientRect().height;
        if (height < 40) undersizedTargets.push({ control: controlName(summary), targetHeight: Math.round(height * 10) / 10 });
      }
      return {
        missingImageAlt: images.filter((element) => !element.hasAttribute('alt')).length,
        brokenImages: images.filter((element) => !(element as HTMLImageElement).naturalWidth).map((element) => element.getAttribute('src')),
        unnamedControls,
        clippedControls,
        undersizedTargets,
      };
    });
    await writeFile(resolve(directory, `${name}-${width}-audit.json`), JSON.stringify({ dimensions, ...audit }, null, 2));
    expect(audit.missingImageAlt, `${name}: missing image descriptions`).toBe(0);
    expect(audit.brokenImages, `${name}: broken images`).toEqual([]);
    expect(audit.unnamedControls, `${name}: unnamed controls`).toEqual([]);
    expect(audit.clippedControls, `${name}: horizontally clipped controls`).toEqual([]);
    expect(audit.undersizedTargets, `${name}: targets under 40px`).toEqual([]);
    await page.screenshot({
      path: resolve(directory, `${name}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
      style: 'nextjs-portal { visibility: hidden !important; }',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('administrator surfaces and create dialog remain usable at all target widths', async ({ page, adminSession }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await capturePage(page, 'login');
  await loginAsAdmin(page, adminSession);
  for (const [name, path] of [
    ['admin-teachers', '/admin/teachers'],
    ['admin-classes', '/admin/classes'],
    ['admin-audit-redemptions', '/admin/audit?view=redemptions'],
    ['admin-audit-management', '/admin/audit?view=management'],
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await capturePage(page, name);
  }
  await page.goto('/admin/teachers');
  const trigger = page.getByRole('button', { name: '创建老师', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: resolve('test-results/ui-redesign', `create-teacher-${width}.png`), animations: 'disabled' });
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await page.goto('/admin/classes');
  await page.getByRole('button', { name: '创建班级', exact: true }).click();
  const createClassDialog = page.getByRole('dialog');
  await createClassDialog.getByRole('textbox', { name: '班级名称' }).fill('视觉验收班');
  await createClassDialog.getByRole('button', { name: '创建班级' }).click();
  await expect(createClassDialog).not.toBeVisible();
  await page.getByRole('button', { name: '编辑班级视觉验收班' }).click();
  const editClassDialog = page.getByRole('dialog');
  await expect(editClassDialog).toBeVisible();
  for (const width of [1366, 375]) {
    await page.setViewportSize({ width, height: 768 });
    const box = await editClassDialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: resolve('test-results/ui-redesign', `edit-class-${width}.png`), animations: 'disabled' });
    await editClassDialog.getByRole('button', { name: '保存班级设置' }).scrollIntoViewIfNeeded();
    await expect(editClassDialog.getByRole('button', { name: '保存班级设置' })).toBeInViewport();
    await editClassDialog.getByRole('button', { name: '归档班级' }).scrollIntoViewIfNeeded();
    await expect(editClassDialog.getByRole('button', { name: '归档班级' })).toBeInViewport();
    await page.screenshot({ path: resolve('test-results/ui-redesign', `edit-class-bottom-${width}.png`), animations: 'disabled' });
  }
  await page.keyboard.press('Escape');
  await expect(editClassDialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('teacher, class, authentication and live-session surfaces fit every target width', async ({ page, teacherSession }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(teacherSession.email);
  await page.getByLabel('密码').fill(teacherSession.temporaryPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/change-password');
  await capturePage(page, 'change-password');
  await page.getByLabel('当前密码').fill(teacherSession.temporaryPassword);
  await page.getByLabel('新密码', { exact: true }).fill(teacherSession.password);
  await page.getByLabel('确认新密码').fill(teacherSession.password);
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await page.waitForURL('**/teacher');
  const base = `/classes/${teacherSession.classId}`;
  for (const [name, path] of [
    ['teacher', '/teacher'],
    ['classes', '/classes'],
    ['class-overview', base],
    ['students', `${base}/students`],
    ['prizes', `${base}/prizes`],
    ['lotteries', `${base}/lotteries`],
    ['new-lottery', `${base}/lotteries/new`],
    ['winnings', `${base}/winnings`],
    ['lottery-session', `${base}/lotteries/${teacherSession.sessionId}`],
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await capturePage(page, name);
  }
  expect(errors).toEqual([]);
});
