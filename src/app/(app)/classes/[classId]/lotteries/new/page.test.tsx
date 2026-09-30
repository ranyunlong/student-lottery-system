import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import SessionSetupPage from './page';
import { listPrizes } from '../../../../../../features/prizes/service';
import { listStudents } from '../../../../../../features/students/service';

vi.mock('../../../../../../features/lotteries/actions', () => ({ saveSessionAction: vi.fn() }));
vi.mock('../../../../../../features/lotteries/sessions', () => ({ getSession: vi.fn() }));
vi.mock('../../../../../../features/prizes/service', () => ({ listPrizes: vi.fn() }));
vi.mock('../../../../../../features/students/service', () => ({ listStudents: vi.fn() }));
vi.mock('../../../../../../lib/access', () => ({ requireClassAccess: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

test('switching lottery mode keeps the draft session id in the URL', async () => {
  vi.mocked(listStudents).mockResolvedValue([] as never);
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize', sessionId: 'draft / 1' }),
  }));

  expect(screen.getByRole('link', { name: /指定奖品 · 随机学生/ })).toHaveAttribute(
    'href', '?mode=prize-student&sessionId=draft%20%2F%201',
  );
  expect(screen.getByRole('heading', { name: '新建抽奖场次' })).not.toHaveClass('border-l-4');
  expect(screen.getByLabelText('每人最多抽取次数')).toBeInTheDocument();
  expect(screen.queryByText('先选择模式，再设置本场候选学生和奖品。')).not.toBeInTheDocument();
});

test('candidate transfer controls add students and prizes to the submission', async () => {
  vi.mocked(listStudents).mockResolvedValue([{
    id: 42, classId: 'class-1', studentNumber: 'S042', name: '林同学', gender: null,
    archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z'),
  }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{
    id: 'prize-1', classId: 'class-1', name: '画册', stock: 6, archived: false,
    createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z'),
  }] as never);
  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize' }),
  }));

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '添加 S042 · 林同学' }));
  await user.click(screen.getByRole('button', { name: '添加 画册' }));
  expect(document.querySelector('input[name="studentIds"]')).toHaveValue('42');
  expect(document.querySelector('input[name="prizeIds"]')).toHaveValue('prize-1');
  expect(screen.getByRole('spinbutton', { name: '本场数量 画册' })).toBeInTheDocument();
});

test('session setup exposes an optional title', async () => {
  vi.mocked(listStudents).mockResolvedValue([] as never);
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize' }),
  }));

  const title = document.querySelector<HTMLInputElement>('input[name="title"]');
  expect(title).not.toBeNull();
  expect(title).not.toBeRequired();
});

test('both candidate lists use searchable transfer controls without changing submission names', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', name: '画册', stock: 6, archived: false }] as never);
  render(await SessionSetupPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ mode: 'student-prize' }) }));
  expect(screen.getByRole('searchbox', { name: '搜索学生' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: '搜索奖品' })).toBeInTheDocument();
});

test('fixed prize shows its inventory as the maximum available draw rounds', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', name: '画册', stock: 6, archived: false }] as never);
  render(await SessionSetupPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ mode: 'prize-student' }) }));

  expect(screen.getByRole('button', { name: '添加 画册' })).toHaveTextContent('最多抽取 6 轮');
  expect(screen.getByLabelText('抽取轮数')).toHaveAttribute('max', '2147483647');
});

test('per-student draw limit sits beside the create action and wraps on narrow layouts', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', name: '画册', stock: 6, archived: false }] as never);
  render(await SessionSetupPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ mode: 'student-prize' }) }));

  const limit = screen.getByLabelText('每人最多抽取次数');
  const field = limit.closest('label')?.parentElement;
  const submit = screen.getByRole('button', { name: '创建并进入现场抽奖' });
  expect(field?.nextElementSibling).toBe(submit);
  expect(field).toHaveClass('w-64', 'max-w-full');
  expect(submit.closest('form')).toHaveClass('flex-wrap');
});
