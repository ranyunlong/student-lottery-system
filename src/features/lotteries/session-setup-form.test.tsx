import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./actions', () => ({ saveSessionAction: vi.fn(), activateSessionAction: vi.fn() }));
import { activateSessionAction, saveSessionAction } from './actions';
import { SessionSetupForm } from './session-setup-form';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('creates, activates, then enters the on-site draw screen', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '场次已创建', sessionId: 'session-9' });
  vi.mocked(activateSessionAction).mockResolvedValue({ ok: true, message: '场次已开始' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="student-prize"><input name="studentIds" value="42" readOnly /><input name="prizeIds" value="p1" readOnly /><input name="quantity:p1" value="2" readOnly /><input name="stock:p1" value="3" readOnly /></SessionSetupForm>);

  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));

  expect(saveSessionAction).toHaveBeenCalledTimes(1);
  expect(activateSessionAction).toHaveBeenCalledWith(expect.any(FormData));
  expect(push).toHaveBeenCalledWith('/classes/class-1/lotteries/session-9');
});

test('retries activation without creating a duplicate draft', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '场次已创建', sessionId: 'session-9' });
  vi.mocked(activateSessionAction)
    .mockResolvedValueOnce({ ok: false, message: '暂时无法开始' })
    .mockResolvedValueOnce({ ok: true, message: '场次已开始' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="student-prize"><input name="studentIds" value="42" readOnly /><input name="prizeIds" value="p1" readOnly /><input name="quantity:p1" value="2" readOnly /><input name="stock:p1" value="3" readOnly /></SessionSetupForm>);

  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法开始');
  const retry = await screen.findByRole('button', { name: '重试进入现场' });
  await waitFor(() => expect(retry).toBeEnabled());
  await user.click(retry);

  expect(saveSessionAction).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/classes/class-1/lotteries/session-9'));
});

test('saving an existing draft returns to the session list without activating it', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '草稿已保存', sessionId: 'draft-2' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="prize-student" sessionId="draft-2"><input name="studentIds" value="42" readOnly /><input name="prizeId" value="p1" readOnly /><input name="roundCount" value="1" readOnly /><input name="prizeStock" value="3" readOnly /></SessionSetupForm>);

  await user.click(screen.getByRole('button', { name: '保存草稿' }));

  expect(activateSessionAction).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith('/classes/class-1/lotteries');
});

test('does not save when selected prize quantities do not strictly exceed selected students', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '场次已创建', sessionId: 'session-10' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="student-prize"><input name="studentIds" value="42" readOnly /><input name="prizeIds" value="p1" readOnly /><input name="quantity:p1" value="1" readOnly /><input name="stock:p1" value="3" readOnly /></SessionSetupForm>);
  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));
  expect(saveSessionAction).not.toHaveBeenCalled();
  expect(await screen.findByRole('alert')).toHaveTextContent('奖品数量总和必须大于已选学生人数');
  expect(activateSessionAction).not.toHaveBeenCalled();
});

test('saves when selected prize quantities strictly exceed selected students', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '场次已创建', sessionId: 'session-10' });
  vi.mocked(activateSessionAction).mockResolvedValue({ ok: true, message: '场次已开始' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="student-prize"><input name="studentIds" value="42" readOnly /><input name="studentIds" value="43" readOnly /><input name="prizeIds" value="p1" readOnly /><input name="prizeIds" value="p2" readOnly /><input name="quantity:p1" value="1" readOnly /><input name="quantity:p2" value="2" readOnly /><input name="stock:p1" value="3" readOnly /><input name="stock:p2" value="3" readOnly /></SessionSetupForm>);
  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));
  await waitFor(() => expect(saveSessionAction).toHaveBeenCalledTimes(1));
});

test('allows fixed prize draw rounds to exceed the selected student count', async () => {
  vi.mocked(saveSessionAction).mockResolvedValue({ ok: true, message: '场次已创建', sessionId: 'session-11' });
  vi.mocked(activateSessionAction).mockResolvedValue({ ok: true, message: '场次已开始' });
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="prize-student"><input name="studentIds" value="42" readOnly /><input name="prizeId" value="p1" readOnly /><input name="roundCount" type="number" value="3" readOnly /><input name="prizeStock" value="6" readOnly /></SessionSetupForm>);
  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));
  await waitFor(() => expect(saveSessionAction).toHaveBeenCalledTimes(1));
});

test('does not save fixed prize rounds above its available stock', async () => {
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="prize-student"><input name="studentIds" value="42" readOnly /><input name="prizeId" value="p1" readOnly /><input name="roundCount" value="4" readOnly /><input name="prizeStock" value="3" readOnly /></SessionSetupForm>);

  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('抽取轮数不能超过所选奖品的可用库存');
  expect(saveSessionAction).not.toHaveBeenCalled();
});

test('does not save an individual prize quantity above its available stock', async () => {
  const user = userEvent.setup();
  render(<SessionSetupForm classId="class-1" mode="student-prize"><input name="studentIds" value="42" readOnly /><input name="prizeIds" value="p1" readOnly /><input name="quantity:p1" value="4" readOnly /><input name="stock:p1" value="3" readOnly /></SessionSetupForm>);

  await user.click(screen.getByRole('button', { name: '创建并进入现场抽奖' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('奖品配置数量不能超过可用库存');
  expect(saveSessionAction).not.toHaveBeenCalled();
});
