import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
type DrawStageResult = Awaited<ReturnType<DrawStageActions['stop']>>;

function actions(overrides: Partial<DrawStageActions> = {}): DrawStageActions {
  return {
    start: vi.fn(async (studentId?: number) => {
      if (studentId !== 1) throw new Error('未选择学生');
      return { token: 'round-1' };
    }),
    stop: vi.fn(async () => ({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p', prizeName: '笔记本' })),
    ...overrides,
  };
}

async function chooseStudent(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByRole('combobox', { name: '本轮学生' }));
  const option = (await screen.findAllByRole('option'))[Number(value) - 1];
  if (!option) throw new Error(`Student option ${value} was not rendered`);
  await user.click(option);
}

beforeEach(() => {
  localStorage.clear(); routerRefresh.mockClear();
});
afterEach(cleanup);

test('选择学生后开始本地动画，停止后只显示服务端中奖结果', async () => {
  const user = userEvent.setup();
  const api = actions();
  render(<DrawStage session={session} actions={api} />);

  await chooseStudent(user, '1');
  expect(screen.getByRole('button', { name: '开始抽奖' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(screen.getByRole('button', { name: '停止' })).toBeEnabled();
  expect(screen.getByText('抽奖进行中')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '停止' }));

  expect(api.stop).toHaveBeenCalledWith('round-1');
  const winner = await screen.findByRole('region', { name: '中奖结果' });
  expect(winner).toHaveTextContent('笔记本');
  expect(winner).toHaveTextContent('张三');
});

test('选择第二名学生后开始抽奖时提交对应学生 ID', async () => {
  const user = userEvent.setup();
  const api = actions({ start: vi.fn(async () => ({ token: 'round-b' })) });
  render(<DrawStage session={{ ...session, candidates: [
    { id: 1, name: 'A同学', remaining: 1 }, { id: 2, name: 'B同学', remaining: 1 },
  ] }} actions={api} />);

  await chooseStudent(user, '2');
  expect(screen.getByRole('combobox', { name: '本轮学生' })).toHaveTextContent('B同学');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  expect(api.start).toHaveBeenCalledWith(2);
});

test('本轮学生默认选中第一个可用学生并显示参与人数', () => {
  render(<DrawStage session={{ ...session, candidates: [
    { id: 1, name: '已抽完同学', remaining: 0 },
    { id: 2, name: '首位参与同学', remaining: 1 },
    { id: 3, name: '第二位参与同学', remaining: 1 },
  ] }} actions={actions()} immersive />);

  expect(screen.getByRole('combobox', { name: '本轮学生' })).toHaveTextContent('首位参与同学');
  expect(screen.getByText('参与人数 3 人')).toBeVisible();
});

test('不可用候选人不能开始，库存或次数耗尽时显示原因', async () => {
  const user = userEvent.setup();
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '张三', remaining: 0 }], drawsRemaining: 0 }} actions={actions()} />);
  await user.click(screen.getByRole('combobox', { name: '本轮学生' }));
  expect(await screen.findByRole('option', { name: /张三/ })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByText('没有可用的候选学生或抽奖次数已用尽')).toBeVisible();

  cleanup();
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
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(await screen.findByText('网络错误')).toBeVisible();
  expect(screen.getByRole('button', { name: '重试停止' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '重试停止' }));
  expect(await screen.findByRole('region', { name: '中奖结果' })).toHaveTextContent('笔记本');
  expect(api.start).toHaveBeenCalledTimes(1);
  expect(api.stop).toHaveBeenCalledTimes(2);
});

test('刷新后从 pendingToken 恢复，但现场不提供取消轮次入口', () => {
  const api = actions();
  render(<DrawStage session={{ ...session, pendingToken: 'round-1' }} actions={api} />);
  expect(screen.getByText('已恢复进行中的轮次')).toBeVisible();
  expect(screen.queryByRole('button', { name: '取消轮次' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '确认取消本轮抽奖？' })).not.toBeInTheDocument();
});

test('固定奖品模式只允许开始，不显示学生选择器', () => {
  render(<DrawStage session={{ ...session, mode: 'prize-student', prizes: [{ id: 'p', name: '笔记本', stock: 2, quotaRemaining: 2 }], drawsRemaining: 2 }} actions={actions()} />);
  expect(screen.queryByLabelText('本轮学生')).not.toBeInTheDocument();
  expect(screen.getByText('固定奖品：笔记本')).toBeVisible();
});




test('长中文名称保持在可视区域内并为主要操作提供焦点与触摸尺寸', async () => {
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '这是一个很长很长的学生姓名用于移动端测试', remaining: 1 }] }} actions={actions()} />);
  expect(screen.getByRole('button', { name: '开始抽奖' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: '开始抽奖' })).toHaveClass('focus-visible:outline-2');
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: '本轮学生' }));
  expect(await screen.findByRole('option', { name: /这是一个很长/ })).toBeInTheDocument();
});

test('动画区域在 reduced motion 下仍可显示结果而不依赖定时器', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const api = actions();
  render(<DrawStage session={session} actions={api} />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(screen.getByText('抽奖进行中')).toBeVisible();
  vi.unstubAllGlobals();
});



test('刷新恢复 active round 时选中服务端返回的真实 B 学生', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: 'A同学', remaining: 1 }, { id: 2, name: 'B同学', remaining: 1 }], pendingToken: 'round-b', pendingStudentId: 2 }} actions={actions()} />);
  expect(screen.getByRole('combobox', { name: '本轮学生' })).toHaveTextContent('B同学');
  vi.unstubAllGlobals();
});

test('归档候选不能开始且仍计入本场参与人数', async () => {
  const api = actions();
  render(<DrawStage session={{ ...session, candidates: [{ id: 1, name: '已归档学生', remaining: 1, archived: true }] }} actions={api} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: '本轮学生' }));
  expect(await screen.findByRole('option', { name: /已归档学生/ })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByText('参与人数 1 人')).toBeVisible();
  expect(screen.getByRole('button', { name: '开始抽奖', hidden: true })).toBeDisabled();
});

test('持久化结果刷新候选后，下一轮切换到新的首位可用学生', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const api = actions();
  const firstSession = { ...session, candidates: [
    { id: 1, name: '甲同学', remaining: 1 }, { id: 2, name: '乙同学', remaining: 1 },
  ] };
  const { rerender } = render(<DrawStage session={firstSession} actions={api} />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  await user.click(screen.getByRole('button', { name: '停止' }));
  rerender(<DrawStage session={{ ...firstSession, candidates: [
    { id: 1, name: '甲同学', remaining: 0 }, { id: 2, name: '乙同学', remaining: 1 },
  ], drawsRemaining: 1 }} actions={api} />);
  expect(screen.getByRole('combobox', { name: '本轮学生' })).toHaveTextContent('乙同学');
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

test('stop pending keeps phase announced and all round controls disabled', async () => {
  const user = userEvent.setup();
  let finishStop!: (value: Awaited<ReturnType<DrawStageActions['stop']>>) => void;
  const api = actions({ stop: vi.fn(() => new Promise<DrawStageResult>((resolve) => { finishStop = resolve; })) });
  render(<DrawStage session={{ ...session, pendingToken: 'round-1' }} actions={api} />);
  await user.click(screen.getByRole('button', { name: '停止' }));
  expect(screen.getByText('抽奖进行中')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeDisabled());
  expect(screen.queryByRole('button', { name: '取消轮次' })).not.toBeInTheDocument();
  finishStop({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p', prizeName: '笔记本' });
  expect(await screen.findByRole('region', { name: '中奖结果' })).toHaveTextContent('张三');
});

test('student-prize mode keeps its chosen student fixed while the prize ticker advances', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const drawSession = {
    ...session,
    candidates: [{ id: 1, name: '甲同学', remaining: 1 }, { id: 2, name: '乙同学', remaining: 1 }],
    prizes: [
      { id: 'p1', name: '画册', stock: 2, quotaRemaining: 2 },
      { id: 'p2', name: '彩笔', stock: 2, quotaRemaining: 2 },
    ],
  };
  render(<DrawStage session={drawSession} actions={actions()} />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  const ticker = screen.getByRole('region', { name: '抽取候选' });
  expect(ticker).toHaveAttribute('aria-live', 'off');
  await waitFor(() => expect(ticker).toHaveTextContent('彩笔'));
  expect(ticker).not.toHaveTextContent('乙同学');
  expect(screen.getByRole('combobox', { name: '本轮学生' })).toHaveTextContent('甲同学');
  vi.unstubAllGlobals();
});

test('immersive prize draw rolls prize names in three slot windows and reveals only the committed prize', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const drawSession = { ...session, prizes: [
    { id: 'p1', name: '画册', stock: 2, quotaRemaining: 2 },
    { id: 'p2', name: '彩笔', stock: 2, quotaRemaining: 2 },
  ] };
  const api = actions({ stop: vi.fn(async () => ({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p2', prizeName: '彩笔' })) });
  render(<DrawStage session={drawSession} actions={api} immersive />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  const stage = screen.getByRole('region', { name: '抽取候选' });
  expect(within(stage).getAllByTestId('slot-window')).toHaveLength(3);
  await waitFor(() => expect(within(stage).getByTestId('slot-current')).toHaveTextContent('彩笔'));
  expect(stage).not.toHaveTextContent('张三');

  await user.click(screen.getByRole('button', { name: '停止' }));
  const result = await screen.findByRole('region', { name: '中奖结果' });
  expect(within(result).getByTestId('slot-current')).toHaveTextContent('彩笔');
  expect(result).toHaveTextContent('张三');
  vi.unstubAllGlobals();
});

test('many prize categories keep the slot stage bounded to three windows', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const prizes = Array.from({ length: 80 }, (_, index) => ({
    id: `p${index}`, name: `第${index + 1}种很长的奖品名称`, stock: 1, quotaRemaining: 1,
  }));
  render(<DrawStage session={{ ...session, prizes }} actions={actions()} immersive />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  const stage = screen.getByRole('region', { name: '抽取候选' });
  expect(within(stage).getAllByTestId('slot-window')).toHaveLength(3);
  expect(within(stage).getByTestId('slot-current')).toHaveTextContent('第1种很长的奖品名称');
  expect(stage).not.toHaveTextContent('第40种很长的奖品名称');
  vi.unstubAllGlobals();
});

test('one available prize uses a single window instead of repeating its name three times', async () => {
  const user = userEvent.setup();
  render(<DrawStage session={session} actions={actions()} immersive />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  const stage = screen.getByRole('region', { name: '抽取候选' });
  expect(within(stage).getByTestId('slot-current')).toHaveTextContent('笔记本');
  expect(within(stage).queryAllByTestId('slot-window')).toHaveLength(0);
});

test('reduced motion keeps the reel readable and stationary while preserving the committed result', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const drawSession = { ...session, prizes: [
    { id: 'p1', name: '画册', stock: 2, quotaRemaining: 2 },
    { id: 'p2', name: '彩笔', stock: 2, quotaRemaining: 2 },
  ] };
  const api = actions({ stop: vi.fn(async () => ({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p2', prizeName: '彩笔' })) });
  render(<DrawStage session={drawSession} actions={api} immersive />);
  await chooseStudent(user, '1');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  const reel = screen.getByRole('region', { name: '抽取候选' });
  expect(within(reel).getByTestId('slot-current')).toHaveTextContent('画册');
  await new Promise((resolve) => setTimeout(resolve, 560));
  expect(within(reel).getByTestId('slot-current')).toHaveTextContent('画册');

  await user.click(screen.getByRole('button', { name: '停止' }));
  const result = await screen.findByRole('region', { name: '中奖结果' });
  expect(within(result).getByTestId('slot-current')).toHaveTextContent('彩笔');
  expect(result).toHaveTextContent('张三');
  vi.unstubAllGlobals();
});

test('sound is created for each slot ticker jump, not at start or stop, and can be muted', async () => {
  vi.useFakeTimers();
  const oscillator = {
    connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  };
  const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
  const audioContext = vi.fn();
  class MockAudioContext {
    currentTime = 0;
    destination = {};
    constructor() { audioContext(); }
    createOscillator() { return oscillator; }
    createGain() { return gain; }
    close = vi.fn(async () => {});
    resume = vi.fn(async () => {});
  }
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('AudioContext', MockAudioContext);
  try {
    render(<DrawStage session={{
      ...session,
      prizes: [
        { id: 'p1', name: '画册', stock: 2, quotaRemaining: 2 },
        { id: 'p2', name: '彩笔', stock: 2, quotaRemaining: 2 },
      ],
    }} actions={actions()} immersive />);

    expect(audioContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '开始抽奖' }));
    await act(async () => {});
    expect(audioContext).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(520); });
    expect(audioContext).toHaveBeenCalledTimes(1);
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(520); });
    expect(audioContext).toHaveBeenCalledTimes(2);
    expect(oscillator.start).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '停止' }));
    await act(async () => {});
    expect(screen.getByRole('region', { name: '中奖结果' })).toBeInTheDocument();
    expect(audioContext).toHaveBeenCalledTimes(2);
    expect(oscillator.start).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '静音音效' }));
    fireEvent.click(screen.getByRole('button', { name: '下一轮' }));
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(520); });
    expect(audioContext).toHaveBeenCalledTimes(2);
    expect(oscillator.start).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test('reduced motion suppresses lottery sound', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const user = userEvent.setup();
  const audioContext = vi.fn();
  vi.stubGlobal('AudioContext', audioContext);
  render(<DrawStage session={session} actions={actions()} immersive />);
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));

  expect(audioContext).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('zero sound volume mutes playback and the volume preference survives remount', async () => {
  const user = userEvent.setup();
  const audioContext = vi.fn();
  class MockAudioContext { constructor() { audioContext(); } }
  vi.stubGlobal('AudioContext', MockAudioContext);
  const view = render(<DrawStage session={session} actions={actions()} immersive />);
  const volume = screen.getByRole('slider', { name: '音效音量' });

  fireEvent.change(volume, { target: { value: '0' } });
  expect(volume).toHaveValue('0');
  expect(localStorage.getItem('student-lottery:onsite-sound')).toBe('0');
  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(audioContext).not.toHaveBeenCalled();

  view.unmount();
  render(<DrawStage session={session} actions={actions()} immersive />);
  expect(screen.getByRole('slider', { name: '音效音量' })).toHaveValue('0');
  vi.unstubAllGlobals();
});

test('audio device errors do not interrupt starting a draw', async () => {
  const user = userEvent.setup();
  const api = actions();
  class BrokenAudioContext { constructor() { throw new Error('audio unavailable'); } }
  vi.stubGlobal('AudioContext', BrokenAudioContext);
  render(<DrawStage session={session} actions={api} immersive />);

  await user.click(screen.getByRole('button', { name: '开始抽奖' }));
  expect(api.start).toHaveBeenCalledWith(1);
  expect(screen.getByRole('button', { name: '停止' })).toBeEnabled();
  vi.unstubAllGlobals();
});
