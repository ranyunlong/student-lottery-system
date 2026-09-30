import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActionForm } from './action-form';
import { CreateDialog } from './create-dialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
afterEach(cleanup);

test('create form opens in a dialog and closes after successful submission', async () => {
  const action = vi.fn(async () => ({ ok: true, message: '已创建' }));
  const user = userEvent.setup();
  render(<CreateDialog title="创建老师" trigger="创建老师" successMessage="老师账号已创建">
    <ActionForm action={action} label="创建账号"><label>姓名<input name="name" required /></label></ActionForm>
  </CreateDialog>);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: '创建老师' });
  expect(trigger).toHaveClass('bg-workspace-accent');
  await user.click(trigger);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  expect(screen.getByRole('textbox', { name: '姓名' })).toHaveFocus();
  await user.type(screen.getByRole('textbox', { name: '姓名' }), '张老师');
  await user.click(screen.getByRole('button', { name: '创建账号' }));
  expect(action).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('status')).toHaveTextContent('老师账号已创建');
  expect(screen.getByRole('status')).toHaveClass('bottom-4', 'sm:top-20');
});

test('row-specific trigger labels coexist with restrained styling and wide dialogs', async () => {
  const user = userEvent.setup();
  render(<div className="text-right"><CreateDialog title="编辑班级" trigger="编辑"
    triggerAriaLabel="编辑班级 一年级" variant="quiet" size="wide">
    <label>班级名称<input name="name" /></label>
  </CreateDialog></div>);

  const trigger = screen.getByRole('button', { name: '编辑班级 一年级' });
  expect(trigger).toHaveTextContent('编辑');
  expect(trigger).toHaveClass('border-workspace-line', 'bg-workspace-surface', 'text-workspace-ink');
  expect(trigger).not.toHaveClass('bg-workspace-accent');
  expect(trigger.parentElement).toHaveClass('text-right');
  expect(trigger).not.toHaveClass('text-left');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await user.click(trigger);
  expect(screen.getByRole('textbox', { name: '班级名称' })).toHaveFocus();
});

test('edit form reports success and restores focus to its trigger', async () => {
  const action = vi.fn(async () => ({ ok: true, message: '资料已更新' }));
  const user = userEvent.setup();
  render(<CreateDialog title="编辑老师资料" trigger="编辑" successMessage="老师资料已更新">
    <ActionForm action={action} label="保存资料"><label>姓名<input name="name" defaultValue="王老师" required /></label></ActionForm>
  </CreateDialog>);

  const trigger = screen.getByRole('button', { name: '编辑' });
  await user.click(trigger);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  await user.click(screen.getByRole('button', { name: '保存资料' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('status')).toHaveTextContent('老师资料已更新');
  expect(trigger).toHaveFocus();
});

test('cancel closes the dialog without submitting', async () => {
  const user = userEvent.setup();
  render(<CreateDialog title="创建班级" trigger="创建班级"><input aria-label="班级名称" /></CreateDialog>);
  const trigger = screen.getByRole('button', { name: '创建班级' });
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: '关闭对话框' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('compact row action has a named icon and cancel keeps its action untouched', async () => {
  const action = vi.fn(async () => ({ ok: true, message: 'Saved' }));
  const user = userEvent.setup();
  render(<CreateDialog title="Edit teacher" trigger="Edit" triggerAriaLabel="Edit teacher Lin"
    triggerIcon={<Pencil aria-hidden="true" />} iconOnly variant="quiet">
    <ActionForm action={action} label="Save" cancelLabel="Cancel"><input name="name" defaultValue="Lin" /></ActionForm>
  </CreateDialog>);
  const trigger = screen.getByRole('button', { name: 'Edit teacher Lin' });
  expect(trigger).not.toHaveTextContent('Edit');
  expect(trigger.querySelector('svg')).not.toBeNull();
  await user.click(trigger);
  expect(screen.getByRole('button', { name: 'Cancel' }).querySelector('svg')).toBeNull();
  expect(screen.getByRole('button', { name: 'Save' }).querySelector('svg')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});
