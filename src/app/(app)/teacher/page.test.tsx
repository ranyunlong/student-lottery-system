import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import TeacherPage from './page';
import { listTeacherClasses } from '../../../features/classes/service';
import { requireTeacherPage } from '../../../lib/workspace-guard';

const emblemRows = vi.hoisted(() => [{ id: 'class-1', emblemPath: 'crest.webp' as string | null }]);
vi.mock('../../../features/classes/service', () => ({ listTeacherClasses: vi.fn() }));
vi.mock('../../../lib/workspace-guard', () => ({ requireTeacherPage: vi.fn() }));
vi.mock('../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => Promise.resolve(emblemRows) }) }) } }));

afterEach(cleanup);

test('renders a class-name search and filters the workspace list', async () => {
  emblemRows[0].emblemPath = 'crest.webp';
  vi.mocked(listTeacherClasses).mockResolvedValue([
    { id: 'class-1', name: '七年级一班' },
    { id: 'class-2', name: '八年级二班' },
  ] as never);
  render(await TeacherPage({ searchParams: Promise.resolve({ q: '七年级' }) }));

  expect(screen.getByRole('searchbox', { name: '搜索班级名称' })).toHaveValue('七年级');
  expect(screen.getByRole('search').closest('[data-slot="card"]')).toBeInTheDocument();
  expect(screen.getByText('1 个班级')).toBeInTheDocument();
  const table = screen.getByRole('table', { name: '我的班级' });
  expect(table.closest('[data-slot="card"]')).toBeInTheDocument();
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['班级', '常用入口', '主要操作']);
  const row = within(table).getByRole('row', { name: /七年级一班/ });
  expect(within(row).getByRole('img', { name: '七年级一班班徽' })).toHaveAttribute('src', '/api/classes/class-1/emblem?v=crest.webp');
  expect(within(row).getByText('班级')).toBeInTheDocument();
  expect(within(row).getByText('常用入口')).toBeInTheDocument();
  expect(within(row).getByText('主要操作')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: /学生名单/ })).toHaveAttribute('href', '/classes/class-1/students');
  expect(within(row).getByRole('link', { name: /进入班级/ })).toHaveAttribute('href', '/classes/class-1');
  expect(within(table).queryByRole('row', { name: /八年级二班/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '清除搜索' })).toHaveAttribute('href', '/teacher');
  expect(requireTeacherPage).toHaveBeenCalledOnce();
  expect(screen.getByText('\u56ed\u4e01\u5de5\u4f5c\u533a')).toBeInTheDocument();
});

test('shows a clearable empty state when no class name matches', async () => {
  vi.mocked(listTeacherClasses).mockResolvedValue([{ id: 'class-1', name: '七年级一班' }] as never);
  render(await TeacherPage({ searchParams: Promise.resolve({ q: '不存在' }) }));

  expect(screen.getByText('没有符合条件的班级。')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '清除搜索' })).toHaveAttribute('href', '/teacher');
});

test('shows an explicit empty state when no classes are assigned', async () => {
  vi.mocked(listTeacherClasses).mockResolvedValue([] as never);
  render(await TeacherPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByText('尚未分配班级，请联系管理员。')).toBeInTheDocument();
});

test('uses an accessible placeholder when a class has no emblem', async () => {
  emblemRows[0].emblemPath = null;
  vi.mocked(listTeacherClasses).mockResolvedValue([{ id: 'class-1', name: '七年级一班' }] as never);
  render(await TeacherPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByRole('img', { name: '七年级一班班徽尚未设置' })).toBeInTheDocument();
});
