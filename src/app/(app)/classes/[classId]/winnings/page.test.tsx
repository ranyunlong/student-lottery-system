import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import WinningsPage from './page';
import { listWinnings } from '../../../../../features/redemptions/service';
import { redeemWinAction } from '../../../../../features/redemptions/actions';

vi.mock('../../../../../db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ name: '七年级一班' }]) }),
      }),
    }),
  },
}));
vi.mock('../../../../../features/redemptions/actions', () => ({ redeemWinAction: vi.fn() }));
vi.mock('../../../../../features/redemptions/service', () => ({ listWinnings: vi.fn() }));
vi.mock('../../../../../lib/access', () => ({ requireClassAccess: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

test('renders semantic labeled winnings and retains explicit redemption status in tabs', async () => {
  vi.mocked(listWinnings).mockImplementation(async (_classId, status) => (
    status === 'pending' ? [] : [{ id: 'win-1', studentNumberSnapshot: '001', studentNameSnapshot: '张三',
      prizeNameSnapshot: '奖品', createdAt: new Date('2026-09-29T00:00:00Z'), redeemedAt: new Date('2026-09-29T01:00:00Z'),
      redeemedByName: '老师', redeemedBy: 'teacher-1' }]
  ) as never);

  render(await WinningsPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ status: 'redeemed' }) }));

  expect(listWinnings).toHaveBeenCalledWith('class-1', 'pending');
  expect(listWinnings).toHaveBeenCalledWith('class-1', 'redeemed');
  expect(screen.getByRole('link', { name: /待兑/ })).toHaveAttribute('href', '/classes/class-1/winnings');
  expect(screen.getByRole('link', { name: /已兑/ })).toHaveAttribute('href', '/classes/class-1/winnings?status=redeemed');
  const table = screen.getByRole('table', { name: '中奖记录' });
  expect(table).toHaveClass('min-w-[60rem]');
  expect(table.querySelector('thead')).not.toHaveClass('max-[1024px]:sr-only');
  expect(table.closest('div.overflow-x-auto')).toBeInTheDocument();
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['学生', '奖品', '中奖时间', '兑换状态', '操作']);
  const row = within(table).getByRole('row', { name: /张三/ });
  expect(within(row).getByText('学生')).toBeInTheDocument();
  expect(within(row).getAllByText('奖品')).toHaveLength(2);
  expect(within(row).getByText(/操作老师/)).toBeInTheDocument();
  expect(row).toHaveTextContent('操作老师 老师');
  expect(row).not.toHaveTextContent('win-1');
  expect(row).not.toHaveTextContent('teacher-1');
});

test('pending redemption keeps its record key hidden until confirmation', async () => {
  const user = userEvent.setup();
  vi.mocked(listWinnings).mockImplementation(async (_classId, status) => (
    status === 'pending' ? [{ id: 'private-win-key', studentNumberSnapshot: '002', studentNameSnapshot: '李四',
      prizeNameSnapshot: '纪念品', createdAt: new Date('2026-09-29T00:00:00Z'), redeemedAt: null,
      redeemedByName: null, redeemedBy: null }] : []
  ) as never);

  render(await WinningsPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({}) }));
  const row = screen.getByRole('row', { name: /李四/ });
  expect(row).not.toHaveTextContent('private-win-key');
  await user.click(within(row).getByRole('button', { name: '标记已兑换' }));
  const dialog = screen.getByRole('dialog', { name: '确认兑换' });
  expect(dialog.querySelector<HTMLInputElement>('input[name="winId"]')).toHaveValue('private-win-key');
  expect(dialog.querySelector<HTMLInputElement>('input[name="winId"]')).toHaveAttribute('type', 'hidden');
});

test('pending winnings search matches student name and number, and clearing restores the URL-filtered list', async () => {
  const user = userEvent.setup();
  vi.mocked(listWinnings).mockImplementation(async (_classId, status) => (
    status === 'pending' ? [
      { id: 'win-1', studentId: 12, studentNumberSnapshot: '0012', studentNameSnapshot: '张三',
        prizeNameSnapshot: '奖品一', createdAt: new Date('2026-09-29T00:00:00Z'), redeemedAt: null, redeemedByName: null, redeemedBy: null },
      { id: 'win-2', studentId: 112, studentNumberSnapshot: '0112', studentNameSnapshot: '李四',
        prizeNameSnapshot: '奖品二', createdAt: new Date('2026-09-28T00:00:00Z'), redeemedAt: null, redeemedByName: null, redeemedBy: null },
    ] : []
  ) as never);

  render(await WinningsPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({ studentId: '12' }) }));
  const search = screen.getByRole('searchbox', { name: '搜索学生姓名或学号' });
  expect(search.closest('div.grid')).toHaveClass('rounded-md', 'border', 'bg-workspace-surface');
  expect(screen.getByRole('row', { name: /张三/ })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /李四/ })).not.toBeInTheDocument();
  expect(screen.getByText('仅显示该学生的待兑换记录')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '查看全部待兑' })).toHaveAttribute('href', '/classes/class-1/winnings');

  await user.type(search, '张三');
  expect(screen.getByRole('row', { name: /张三/ })).toBeInTheDocument();
  await user.clear(search);
  await user.type(search, '0012');
  expect(screen.getByRole('row', { name: /张三/ })).toBeInTheDocument();
  await user.clear(search);
  expect(screen.getByRole('row', { name: /张三/ })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /李四/ })).not.toBeInTheDocument();
});

test('pending winnings search shows a clear empty state when nothing matches', async () => {
  const user = userEvent.setup();
  vi.mocked(listWinnings).mockImplementation(async (_classId, status) => (
    status === 'pending' ? [{ id: 'win-1', studentId: 12, studentNumberSnapshot: '0012', studentNameSnapshot: '张三',
      prizeNameSnapshot: '奖品一', createdAt: new Date('2026-09-29T00:00:00Z'), redeemedAt: null, redeemedByName: null, redeemedBy: null }] : []
  ) as never);

  render(await WinningsPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({}) }));
  await user.type(screen.getByRole('searchbox', { name: '搜索学生姓名或学号' }), '不存在');
  expect(screen.getByText('没有匹配的待兑换记录。')).toBeInTheDocument();
});

test('marking a pending win opens a Radix confirmation and submits only after confirmation', async () => {
  const user = userEvent.setup();
  vi.mocked(listWinnings).mockImplementation(async (_classId, status) => (
    status === 'pending' ? [{ id: 'win-1', studentId: 12, studentNumberSnapshot: '0012', studentNameSnapshot: '张三',
      prizeNameSnapshot: '奖品一', createdAt: new Date('2026-09-29T00:00:00Z'), redeemedAt: null, redeemedByName: null, redeemedBy: null }] : []
  ) as never);
  vi.mocked(redeemWinAction).mockResolvedValue({ ok: true, message: '已标记兑换' });
  const confirmSpy = vi.spyOn(window, 'confirm');

  render(await WinningsPage({ params: Promise.resolve({ classId: 'class-1' }), searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '标记已兑换' }));
  expect(screen.getByRole('dialog', { name: '确认兑换' })).toBeInTheDocument();
  expect(redeemWinAction).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '确认' }));
  await vi.waitFor(() => expect(redeemWinAction).toHaveBeenCalledOnce());
  expect(confirmSpy).not.toHaveBeenCalled();
  const submitted = vi.mocked(redeemWinAction).mock.calls[0][0];
  expect(submitted.get('classId')).toBe('class-1');
  expect(submitted.get('winId')).toBe('win-1');
});
