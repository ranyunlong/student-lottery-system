import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import LotteriesPage from './page';
import { listSessions } from '../../../../../features/lotteries/sessions';

vi.mock('../../../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: '\u4e03\u5e74\u7ea7\u4e00\u73ed' }]) }) }) }) } }));
vi.mock('../../../../../features/lotteries/actions', () => ({ activateSessionAction: vi.fn(), completeSessionAction: vi.fn() }));
vi.mock('../../../../../features/lotteries/sessions', () => ({ listSessions: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

test('includes the class name in the lottery sessions page heading', async () => {
  vi.mocked(listSessions).mockResolvedValue([]);
  render(await LotteriesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  expect(screen.getByRole('heading', { level: 1, name: '\u4e03\u5e74\u7ea7\u4e00\u73ed \u00b7 \u62bd\u5956\u573a\u6b21' })).toBeInTheDocument();
});

test('shows labeled session rows with explicit status and preserves configuration links', async () => {
  vi.mocked(listSessions).mockResolvedValue([{ id: 'session-1', title: '\u6625\u5b63\u62bd\u5956', mode: 'student-prize', status: 'draft', studentIds: ['1'], prizes: [{ prizeId: 'p1' }], perStudentLimit: 2 }] as never);
  render(await LotteriesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const table = screen.getByRole('table', { name: '抽奖场次' });
  expect(table).toHaveClass('min-w-[52rem]');
  expect(table.querySelector('thead')).not.toHaveClass('max-[1024px]:sr-only');
  expect(table.closest('div.overflow-x-auto')).toBeInTheDocument();
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['场次', '状态', '候选范围', '操作']);
  const row = within(table).getByRole('row', { name: /指定学生/ });
  expect(within(row).getByText('状态')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: /\u6625\u5b63\u62bd\u5956/ })).toHaveAttribute('href', '/classes/class-1/lotteries/new?sessionId=session-1&mode=student-prize');
  expect(within(row).getByText('草稿')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: /编辑配置/ })).toHaveAttribute('href', '/classes/class-1/lotteries/new?sessionId=session-1&mode=student-prize');
  expect(within(row).getByRole('button', { name: '开始场次' })).toBeInTheDocument();
  expect(screen.queryByText('配置场次、启动现场抽奖并查看运行状态。')).not.toBeInTheDocument();
});

test('keeps the provided newest-first session order in the table', async () => {
  vi.mocked(listSessions).mockResolvedValue([
    { id: 'session-new', title: '较新场次', mode: 'student-prize', status: 'draft', studentIds: [1], prizes: [{ prizeId: 'p1', quantity: 1 }], perStudentLimit: 1 },
    { id: 'session-old', title: '较早场次', mode: 'student-prize', status: 'draft', studentIds: [2], prizes: [{ prizeId: 'p1', quantity: 1 }], perStudentLimit: 1 },
  ] as never);
  render(await LotteriesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('较新场次');
  expect(rows[2]).toHaveTextContent('较早场次');
});

test('active session title opens its scoped results while the live draw entry remains available', async () => {
  vi.mocked(listSessions).mockResolvedValue([{ id: 'session-live', title: '\u8fdb\u884c\u4e2d\u573a\u6b21', mode: 'student-prize', status: 'active', studentIds: [1], prizes: [{ prizeId: 'p1', quantity: 1 }], perStudentLimit: 1 }] as never);
  render(await LotteriesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const row = screen.getByRole('row', { name: /\u8fdb\u884c\u4e2d\u573a\u6b21/ });
  expect(within(row).getByRole('link', { name: /\u8fdb\u884c\u4e2d\u573a\u6b21/ })).toHaveAttribute('href', '/classes/class-1/lotteries/session-live?view=results');
  expect(within(row).getByRole('link', { name: /\u67e5\u770b\u4e2d\u5956\u8bb0\u5f55/ })).toHaveAttribute('href', '/classes/class-1/lotteries/session-live?view=results');
  expect(within(row).getByRole('link', { name: /\u8fdb\u5165\u73b0\u573a\u62bd\u5956/ })).toHaveAttribute('href', '/classes/class-1/lotteries/session-live');
});

test('completed sessions link to their detail and results page', async () => {
  vi.mocked(listSessions).mockResolvedValue([{ id: 'session-done', title: null, mode: 'prize-student', status: 'completed', studentIds: ['2'], prizeId: 'p2', roundCount: 1 }] as never);
  render(await LotteriesPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  const row = screen.getByRole('row', { name: /指定奖品/ });
  expect(within(row).getByRole('link', { name: /指定奖品 · 随机学生/ })).toHaveAttribute('href', '/classes/class-1/lotteries/session-done?view=results');
  expect(within(row).getByRole('link', { name: /查看中奖记录/ })).toHaveAttribute('href', '/classes/class-1/lotteries/session-done?view=results');
});
