import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock('./rounds.actions', () => ({ startRoundAction: vi.fn(), stopRoundAction: vi.fn(), cancelRoundAction: vi.fn() }));
import { DrawStage, type DrawStageActions, type DrawStageSession } from './draw-stage';

const session: DrawStageSession = {
  mode: 'student-prize',
  candidates: [{ id: 1, name: '张三', remaining: 1 }],
  prizes: [{ id: 'p', name: '笔记本', stock: 1, quotaRemaining: 1 }],
  drawsRemaining: 1,
};

function actions(overrides: Partial<DrawStageActions> = {}): DrawStageActions {
  return {
    start: vi.fn(async (studentId?: number) => {
      if (studentId !== 1) throw new Error('未选择学生');
      return { token: 'round-1' };
    }),
    stop: vi.fn(async () => ({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p', prizeName: '笔记本' })),
    cancel: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => { localStorage.clear(); routerRefresh.mockClear(); });
afterEach(cleanup);

test('选择学生后开始本地动画，停止后只显示服务端中奖结果', async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<DrawStage session={session} actions={api} />);

  await user.selectOptions(screen.getByLabelText('本轮学生'), '1');
  expect(screen.getByRole('button', { name: '开始抽奖' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(screen.getByRole('button', { name: '停止' })).toBeEnabled();
  expect(screen.getByText('抽奖进行中')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '停止' }));

  expect(api.stop).toHaveBeenCalledWith('round-1');
  expect(await screen.findByText('笔记本')).toBeVisible();
  expect(screen.getByText('张三')).toBeVisible();
});

test('不可用候选人不能开始，库存或次数耗尽时显示原因', () => {
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '张三', remaining: 0 }], drawsRemaining: 0 }} actions={actions()} />);
  expect(screen.getByRole('option', { name: /张三/ })).toBeDisabled();
  expect(screen.getByText('没有可用的候选学生或抽奖次数已用尽')).toBeVisible();

  render(<DrawStage session={{ ...session, prizes: [{ ...session.prizes[0], stock: 0 }] }} actions={actions()} />);
  expect(screen.getByText('奖品库存已耗尽')).toBeVisible();
});

test('停止网络错误后允许重试且不会重复提交开始或停止', async () => {
  const user = userEvent.setup();
  let attempts = 0;
  const api = actions({
    stop: vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('网络错误');
      return { winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p', prizeName: '笔记本' };
    }),
  });
  render(<DrawStage session={session} actions={api} />);
  await user.selectOptions(screen.getByLabelText('本轮学生'), '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(await screen.findByText('网络错误')).toBeVisible();
  expect(screen.getByRole('button', { name: '重试停止' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '重试停止' }));
  expect(await screen.findByText('笔记本')).toBeVisible();
  expect(api.start).toHaveBeenCalledTimes(1);
  expect(api.stop).toHaveBeenCalledTimes(2);
});

test('刷新后从 pendingToken 恢复，并支持取消轮次', async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<DrawStage session={{ ...session, pendingToken: 'round-1' }} actions={api} />);
  expect(screen.getByText('已恢复进行中的轮次')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '取消轮次' }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('round-1'));
  expect(screen.getByRole('button', { name: '开始抽奖' })).toBeEnabled();
});

test('固定奖品模式只允许开始，不显示学生选择器', () => {
  render(<DrawStage session={{ ...session, mode: 'prize-student', prizes: [{ id: 'p', name: '笔记本', stock: 2, quotaRemaining: 2 }], drawsRemaining: 2 }} actions={actions()} />);
  expect(screen.queryByLabelText('本轮学生')).not.toBeInTheDocument();
  expect(screen.getByText('固定奖品：笔记本')).toBeVisible();
});




test('长中文名称保持在可视区域内并为主要操作提供焦点与触摸尺寸', () => {
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '这是一个很长很长的学生姓名用于移动端测试', remaining: 1 }] }} actions={actions()} />);
  expect(screen.getByRole('button', { name: '开始抽奖' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: '开始抽奖' })).toHaveClass('focus-visible:outline-2');
  expect(screen.getByRole('option', { name: /这是一个很长/ })).toBeInTheDocument();
});

test('动画区域在 reduced motion 下仍可显示结果而不依赖定时器', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const api = actions();
  render(<DrawStage session={session} actions={api} />);
  await user.selectOptions(screen.getByLabelText('本轮学生'), '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(screen.getByText('抽奖进行中')).toBeVisible();
  vi.unstubAllGlobals();
});



test('刷新恢复 active round 时选中服务端返回的真实 B 学生', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: 'A同学', remaining: 1 }, { id: 2, name: 'B同学', remaining: 1 }], pendingToken: 'round-b', pendingStudentId: 2 }} actions={actions()} />);
  expect(screen.getByLabelText('本轮学生')).toHaveValue('2');
  vi.unstubAllGlobals();
});

test('归档候选不能开始且不计入可用学生', () => {
  const api = actions();
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '已归档学生', remaining: 1, archived: true }] }} actions={api} />);
  expect(screen.getByRole('option', { name: /已归档学生/ })).toBeDisabled();
  expect(screen.getByText((_, element) => Boolean(element?.tagName === 'P' && element.textContent?.includes('可用学生') && element.textContent.includes('0')))).toBeVisible();
  expect(screen.getByRole('button', { name: '开始抽奖' })).toBeDisabled();
});

test('持久化结果刷新候选后，下一轮切换到新的首位可用学生', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const api = actions();
  const firstSession = { ...session, candidates: [
    { id: 1, name: '甲同学', remaining: 1 }, { id: 2, name: '乙同学', remaining: 1 },
  ] };
  const { rerender } = render(<DrawStage session={firstSession} actions={api} />);
  await user.selectOptions(screen.getByLabelText('本轮学生'), '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  await user.click(screen.getByRole('button', { name: '停止' }));
  rerender(<DrawStage session={{ ...firstSession, candidates: [
    { id: 1, name: '甲同学', remaining: 0 }, { id: 2, name: '乙同学', remaining: 1 },
  ], drawsRemaining: 1 }} actions={api} />);
  expect(screen.getByLabelText('本轮学生')).toHaveValue('2');
  await user.click(screen.getByRole('button', { name: '下一轮' }));
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(api.start).toHaveBeenLastCalledWith(2);
  vi.unstubAllGlobals();
});

test('committed rounds refresh counts and offer another round only while draws remain', async () => {
  const user = userEvent.setup();
  const api = actions({ start: vi.fn(async () => ({ token: 'round-2' })) });
  const initial = { ...session, mode: 'prize-student' as const, drawsRemaining: 2,
    prizes: [{ ...session.prizes[0], stock: 2, quotaRemaining: 2 }] };
  const view = render(<DrawStage session={initial} actions={api} />);

  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(await screen.findByRole('button', { name: '下一轮' })).toBeVisible();
  expect(routerRefresh).toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '下一轮' }));
  expect(screen.getByRole('button', { name: '开始抽奖' })).toBeVisible();
  view.rerender(<DrawStage session={{ ...initial, drawsRemaining: 0 }} actions={api} />);
  expect(screen.queryByRole('button', { name: '下一轮' })).not.toBeInTheDocument();
});
