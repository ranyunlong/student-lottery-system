import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ClassHomePage from './page';
import { listStudents } from '../../../../features/students/service';
import { listPrizes } from '../../../../features/prizes/service';
import { listSessions } from '../../../../features/lotteries/sessions';
import { listWinnings } from '../../../../features/redemptions/service';

const classRows = vi.hoisted(() => [{ name: '七年级一班', archived: false, emblemPath: 'crest.webp' as string | null }]);
vi.mock('../../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(classRows) }) }) }) } }));
vi.mock('../../../../features/students/service', () => ({ listStudents: vi.fn() }));
vi.mock('../../../../features/prizes/service', () => ({ listPrizes: vi.fn() }));
vi.mock('../../../../features/lotteries/sessions', () => ({ listSessions: vi.fn() }));
vi.mock('../../../../features/redemptions/service', () => ({ listWinnings: vi.fn() }));
vi.mock('../../../../lib/access', () => ({ requireClassAccess: vi.fn() }));
afterEach(cleanup);

test('composes class navigation, labeled summary metrics, and direct workflow links', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 1, archived: false }] as never);
  vi.mocked(listPrizes).mockResolvedValue([{ stock: 4, archived: false }] as never);
  vi.mocked(listSessions).mockResolvedValue([{ status: 'active' }] as never);
  vi.mocked(listWinnings).mockResolvedValue([{ id: 'win-1' }] as never);
  render(await ClassHomePage({ params: Promise.resolve({ classId: 'class-1' }) }));

  expect(screen.getByRole('navigation', { name: '班级工作区' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '七年级一班班徽' })).toHaveAttribute('src', '/api/classes/class-1/emblem?v=crest.webp');
  expect(screen.getByRole('heading', { name: '七年级一班' })).not.toHaveClass('border-l-4');
  const studentMetric = screen.getByText('学生').closest('div')!;
  expect(within(studentMetric).getByText('1')).toBeInTheDocument();
  const actionArea = within(screen.getByRole('region', { name: '班级工作区' }));
  for (const [label, href] of [
    ['学生名单', '/classes/class-1/students'], ['奖品与库存', '/classes/class-1/prizes'],
    ['抽奖场次', '/classes/class-1/lotteries'], ['中奖与兑换', '/classes/class-1/winnings'],
  ]) expect(actionArea.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', href);
});

test('shows an accessible emblem placeholder on the overview when no emblem is configured', async () => {
  classRows[0].emblemPath = null;
  vi.mocked(listStudents).mockResolvedValue([] as never);
  vi.mocked(listPrizes).mockResolvedValue([] as never);
  vi.mocked(listSessions).mockResolvedValue([] as never);
  vi.mocked(listWinnings).mockResolvedValue([] as never);

  render(await ClassHomePage({ params: Promise.resolve({ classId: 'class-1' }) }));

  expect(screen.getByRole('img', { name: '七年级一班班徽尚未设置' })).toBeInTheDocument();
  classRows[0].emblemPath = 'crest.webp';
});
