import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import SessionSetupPage from './page';
import { getSession } from '../../../../../../features/lotteries/sessions';
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
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
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
  expect(screen.getByRole('textbox', { name: '本场数量 画册' })).toBeInTheDocument();
});

test('student-prize mode only offers prizes with stock', async () => {
  vi.mocked(listStudents).mockResolvedValue([{
    id: 42, studentNumber: 'S042', name: '林同学', archived: false,
  }] as never);
  vi.mocked(listPrizes).mockResolvedValue([
    { id: 'p1', name: '画册', stock: 6, archived: false },
    { id: 'p2', name: '铅笔', stock: 0, archived: false },
  ] as never);
  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize' }),
  }));

  expect(screen.getByRole('button', { name: '添加 画册' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '添加 铅笔' })).not.toBeInTheDocument();
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

test('student draw limit controls sit inside the candidate student area', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', name: '画册', stock: 6, archived: false }] as never);
  render(await SessionSetupPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ mode: 'student-prize' }) }));

  const limit = screen.getByLabelText('每人最多抽取次数');
  expect(limit.closest('[data-testid="student-transfer-box"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: '统一设置' })).toHaveAttribute('aria-pressed', 'true');
});

test('restores individual student limits when editing a draft', async () => {
  vi.mocked(listStudents).mockResolvedValue([
    { id: 42, classId: 'class-1', studentNumber: 'S042', name: '林同学', gender: null, archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') },
    { id: 43, classId: 'class-1', studentNumber: 'S043', name: '王同学', gender: null, archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') },
  ] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', classId: 'class-1', name: '画册', stock: 6, archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') }] as never);
  vi.mocked(getSession).mockResolvedValue({
    id: 'draft-1', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'draft',
    studentIds: [42, 43], prizes: [{ prizeId: 'p1', quantity: 3 }], perStudentLimit: 5,
    limitMode: 'individual', studentLimits: [{ studentId: 42, limit: 2 }, { studentId: 43, limit: 5 }], drawsRemaining: 7,
    createdAt: new Date('2026-09-29T00:00:00Z'), startedAt: null, completedAt: null,
  } as never);

  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize', sessionId: 'draft-1' }),
  }));

  expect(screen.getByRole('button', { name: '分别设置' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByDisplayValue('2')).toHaveAttribute('name', 'studentLimit:42');
  expect(screen.getByDisplayValue('5')).toHaveAttribute('name', 'studentLimit:43');
});




test('restores archived selected students in a draft with individual limits', async () => {
  vi.mocked(listStudents).mockResolvedValue([
    { id: 42, classId: 'class-1', studentNumber: 'S042', name: '林同学', gender: null, archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') },
    { id: 43, classId: 'class-1', studentNumber: 'S043', name: '王同学', gender: null, archived: true, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') },
  ] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', classId: 'class-1', name: '画册', stock: 6, archived: false, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') }] as never);
  vi.mocked(getSession).mockResolvedValue({
    id: 'draft-archived', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'draft',
    studentIds: [42, 43], prizes: [{ prizeId: 'p1', quantity: 3 }], perStudentLimit: 5,
    limitMode: 'individual', studentLimits: [{ studentId: 42, limit: 2 }, { studentId: 43, limit: 5 }], drawsRemaining: 7,
    createdAt: new Date('2026-09-29T00:00:00Z'), startedAt: null, completedAt: null,
  } as never);

  render(await SessionSetupPage({
    params: Promise.resolve({ classId: 'class-1' }),
    searchParams: Promise.resolve({ mode: 'student-prize', sessionId: 'draft-archived' }),
  }));

  expect(screen.getByRole('button', { name: /移除 S043 · 王同学.*已归档/ })).toBeInTheDocument();
  expect(screen.getByDisplayValue('5')).toHaveAttribute('name', 'studentLimit:43');
});
test('fixed prize mode does not show student limit controls', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 42, studentNumber: 'S042', name: '林同学', archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ id: 'p1', name: '画册', stock: 6, archived: false }] as never);
  render(await SessionSetupPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ mode: 'prize-student' }) }));

  expect(screen.queryByRole('button', { name: '统一设置' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '分别设置' })).not.toBeInTheDocument();
});
