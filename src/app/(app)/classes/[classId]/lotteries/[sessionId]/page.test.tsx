import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const { select, getSessionMock, listWinningsMock, requireClassAccessMock, listStudentsMock, listPrizesMock, DrawStageMock } = vi.hoisted(() => ({
  select: vi.fn(),
  getSessionMock: vi.fn(),
  listWinningsMock: vi.fn(),
  requireClassAccessMock: vi.fn(),
  listStudentsMock: vi.fn(),
  listPrizesMock: vi.fn(),
  DrawStageMock: vi.fn((props: { session?: { drawsRemaining?: number } }) => <div data-draws-remaining={props.session?.drawsRemaining}>现场抽奖阶段</div>),
}));

vi.mock('../../../../../../db/client', () => ({ db: { select } }));
vi.mock('../../../../../../lib/access', () => ({ requireClassAccess: requireClassAccessMock }));
vi.mock('../../../../../../features/lotteries/sessions', () => ({ getSession: getSessionMock }));
vi.mock('../../../../../../features/redemptions/service', () => ({ listWinnings: listWinningsMock }));
vi.mock('../../../../../../features/students/service', () => ({ listStudents: listStudentsMock }));
vi.mock('../../../../../../features/prizes/service', () => ({ listPrizes: listPrizesMock }));
vi.mock('../../../../../../features/lotteries/draw-stage', () => ({ ProductionDrawStage: DrawStageMock }));

import LotteryLivePage from './page';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('active session results query renders read-only records instead of the live draw stage', async () => {
  getSessionMock.mockResolvedValue({
    id: 'session-live', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'active',
    studentIds: [1], prizes: [{ prizeId: 'prize-1', quantity: 1 }], perStudentLimit: 1,
  });
  const classQuery = { limit: vi.fn().mockResolvedValue([{ name: '二年级一班' }]) };
  const classFilter = { where: vi.fn(() => classQuery) };
  select.mockReturnValue({ from: vi.fn(() => classFilter) });
  listStudentsMock.mockResolvedValue([{ id: 1, name: '候选学生', archived: false }]);
  listPrizesMock.mockResolvedValue([{ id: 'prize-1', name: '候选奖品', stock: 1, archived: false }]);
  listWinningsMock.mockResolvedValue([
    { id: 'win-1', sessionId: 'session-live', studentNumberSnapshot: 'S01', studentNameSnapshot: '本场学生', prizeNameSnapshot: '画册', createdAt: new Date('2026-09-30T09:00:00Z'), redemptionStatus: 'pending' },
    { id: 'win-2', sessionId: 'session-other', studentNumberSnapshot: 'S02', studentNameSnapshot: '其他学生', prizeNameSnapshot: '彩笔', createdAt: new Date('2026-09-30T10:00:00Z'), redemptionStatus: 'pending' },
  ]);

  render(await LotteryLivePage({
    params: Promise.resolve({ classId: 'class-1', sessionId: 'session-live' }),
    searchParams: Promise.resolve({ view: 'results' }),
  }));

  const results = screen.getByRole('region', { name: '本场中奖记录' });
  expect(within(results).getByText('本场学生')).toBeVisible();
  expect(within(results).queryByText('其他学生')).not.toBeInTheDocument();
  expect(within(results).getByText('二年级一班 · 抽奖进行中')).toBeVisible();
  expect(screen.getByRole('link', { name: '返回现场抽奖' })).toHaveAttribute('href', '/classes/class-1/lotteries/session-live');
  expect(DrawStageMock).not.toHaveBeenCalled();
  expect(listStudentsMock).not.toHaveBeenCalled();
  expect(listPrizesMock).not.toHaveBeenCalled();
});

test('live draw header shows the class name in the upper-left when no emblem is configured', async () => {
  getSessionMock.mockResolvedValue({
    id: 'session-live', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'active',
    studentIds: [1], prizes: [{ prizeId: 'prize-1', quantity: 3 }], perStudentLimit: 1, drawsRemaining: 1,
  });
  const classQuery = { limit: vi.fn().mockResolvedValue([{ name: '二年级一班', emblemPath: null }]) };
  const classFilter = { where: vi.fn(() => classQuery) };
  select.mockReturnValue({ from: vi.fn(() => classFilter) });
  listStudentsMock.mockResolvedValue([{ id: 1, name: '候选学生', archived: false }]);
  listPrizesMock.mockResolvedValue([{ id: 'prize-1', name: '候选奖品', stock: 1, archived: false }]);
  listWinningsMock.mockResolvedValue([]);

  render(await LotteryLivePage({
    params: Promise.resolve({ classId: 'class-1', sessionId: 'session-live' }),
    searchParams: Promise.resolve({}),
  }));

  const className = screen.getByRole('img', { name: '二年级一班' });
  expect(className).toHaveTextContent('二年级一班');
  expect(screen.getByRole('banner').firstElementChild).toContainElement(className);
  expect(screen.queryByText('二年级一班 · 现场抽奖')).not.toBeInTheDocument();
  expect(screen.queryByText('指定学生 · 随机奖品')).not.toBeInTheDocument();
  expect(DrawStageMock.mock.calls.at(0)?.[0].session?.drawsRemaining).toBe(1);
});

test('live draw uses the session service remaining-draw count instead of recalculating prize quotas', async () => {
  getSessionMock.mockResolvedValue({
    id: 'session-live', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'active',
    studentIds: [1, 2, 3, 4, 5, 6], prizes: [
      { prizeId: 'prize-1', quantity: 11 }, { prizeId: 'prize-2', quantity: 11 },
    ], perStudentLimit: 4, drawsRemaining: 11,
  });
  const classQuery = { limit: vi.fn().mockResolvedValue([{ name: '二年级一班', emblemPath: null }]) };
  const classFilter = { where: vi.fn(() => classQuery) };
  select.mockReturnValue({ from: vi.fn(() => classFilter) });
  listStudentsMock.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `学生${index + 1}`, archived: false })));
  listPrizesMock.mockResolvedValue([
    { id: 'prize-1', name: '奖品一', stock: 11, archived: false },
    { id: 'prize-2', name: '奖品二', stock: 11, archived: false },
  ]);
  listWinningsMock.mockResolvedValue([
    { id: 'win-1', sessionId: 'session-live', studentId: 1, prizeId: 'prize-1' },
    { id: 'win-2', sessionId: 'session-live', studentId: 2, prizeId: 'prize-2' },
  ]);

  render(await LotteryLivePage({
    params: Promise.resolve({ classId: 'class-1', sessionId: 'session-live' }),
    searchParams: Promise.resolve({}),
  }));

  expect(DrawStageMock.mock.calls.at(0)?.[0].session?.drawsRemaining).toBe(11);
});

test('live draw header shows the configured class emblem in the upper-right', async () => {
  getSessionMock.mockResolvedValue({
    id: 'session-live', classId: 'class-1', title: '春季抽奖', mode: 'student-prize', status: 'active',
    studentIds: [1], prizes: [{ prizeId: 'prize-1', quantity: 1 }], perStudentLimit: 1, drawsRemaining: 1,
  });
  const classQuery = { limit: vi.fn().mockResolvedValue([{ name: '二年级一班', emblemPath: 'class-emblem.webp' }]) };
  const classFilter = { where: vi.fn(() => classQuery) };
  select.mockReturnValue({ from: vi.fn(() => classFilter) });
  listStudentsMock.mockResolvedValue([{ id: 1, name: '候选学生', archived: false }]);
  listPrizesMock.mockResolvedValue([{ id: 'prize-1', name: '候选奖品', stock: 1, archived: false }]);
  listWinningsMock.mockResolvedValue([]);

  render(await LotteryLivePage({
    params: Promise.resolve({ classId: 'class-1', sessionId: 'session-live' }),
    searchParams: Promise.resolve({}),
  }));

  const emblem = screen.getByRole('img', { name: '二年级一班班徽' });
  expect(emblem).toHaveAttribute('src', '/api/classes/class-1/emblem?v=class-emblem.webp');
  expect(screen.getByRole('banner').firstElementChild).toContainElement(emblem);
  expect(screen.queryByText('指定学生 · 随机奖品')).not.toBeInTheDocument();
});
