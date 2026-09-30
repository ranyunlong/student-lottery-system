import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { SessionResults } from './session-results';

afterEach(cleanup);

test('completed view shows only this session records, no internal winning ids, and a keyboard-reachable exit', () => {
  const wins = [
    { id: 'internal-win-id-1', sessionId: 'session-1', studentNumberSnapshot: 'S01', studentNameSnapshot: '林同学', prizeNameSnapshot: '画册', createdAt: new Date('2026-09-29T09:00:00Z'), redemptionStatus: 'pending' },
    { id: 'internal-win-id-2', sessionId: 'session-2', studentNumberSnapshot: 'S02', studentNameSnapshot: '陈同学', prizeNameSnapshot: '彩笔', createdAt: new Date('2026-09-29T10:00:00Z'), redemptionStatus: 'pending' },
  ] as never;
  render(<SessionResults classId="class-1" className="二年级一班" sessionId="session-1" sessionTitle="春季抽奖" sessionStatus="completed" mode="student-prize" wins={wins} />);

  const results = screen.getByRole('region', { name: '本场中奖记录' });
  expect(within(results).getByRole('heading', { level: 1, name: '春季抽奖 · 中奖记录' })).toBeVisible();
  expect(within(results).getByText('林同学')).toBeVisible();
  expect(within(results).queryByText('陈同学')).not.toBeInTheDocument();
  expect(within(results).queryByText('internal-win-id-1')).not.toBeInTheDocument();
  expect(within(results).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByRole('link', { name: '返回场次列表' })).toHaveAttribute('href', '/classes/class-1/lotteries');
  expect(screen.getByRole('link', { name: '返回场次列表' })).toHaveClass('min-h-11');
});

test('active results are read-only, scoped to this session, and link back to the live draw and list', () => {
  const wins = [
    { id: 'active-win', sessionId: 'session-live', studentNumberSnapshot: 'S01', studentNameSnapshot: '本场学生', prizeNameSnapshot: '本场奖品', createdAt: new Date('2026-09-30T09:00:00Z'), redemptionStatus: 'pending' },
    { id: 'other-win', sessionId: 'session-other', studentNumberSnapshot: 'S02', studentNameSnapshot: '其他学生', prizeNameSnapshot: '其他奖品', createdAt: new Date('2026-09-30T10:00:00Z'), redemptionStatus: 'pending' },
  ] as never;
  render(<SessionResults classId="class-1" className="二年级一班" sessionId="session-live" sessionTitle="春季抽奖" sessionStatus="active" mode="student-prize" wins={wins} />);

  const results = screen.getByRole('region', { name: '本场中奖记录' });
  expect(within(results).getByText('二年级一班 · 抽奖进行中')).toBeVisible();
  expect(within(results).queryByText(/抽奖已结束/)).not.toBeInTheDocument();
  expect(within(results).getByText('本场学生')).toBeVisible();
  expect(within(results).queryByText('其他学生')).not.toBeInTheDocument();
  expect(within(results).queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '返回现场抽奖' })).toHaveAttribute('href', '/classes/class-1/lotteries/session-live');
  expect(screen.getByRole('link', { name: '返回场次列表' })).toHaveAttribute('href', '/classes/class-1/lotteries');
});
