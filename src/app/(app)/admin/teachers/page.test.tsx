import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TeachersPage from './page';
import { disableTeacherAction, updateTeacherAction } from '../../../../features/classes/actions';
import { listTeachersPage } from '../../../../features/classes/service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../../../lib/workspace-guard', () => ({ requireAdminPage: async () => {} }));
vi.mock('../../../../features/classes/service', () => ({
  listTeachersPage: vi.fn(async () => ({ items: [{ id: 'teacher-one', name: '王老师', email: 'wang@example.test', banned: false,
    createdAt: new Date('2026-09-27T08:00:00Z') }],
    previousCursor: null, nextCursor: 'teacher-one' })),
}));
vi.mock('../../../../features/classes/actions', () => ({
  createTeacherAction: vi.fn(), disableTeacherAction: vi.fn(), resetTeacherPasswordAction: vi.fn(), updateTeacherAction: vi.fn(),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());

function expectDialogFooterTextOnly(dialog: HTMLElement) {
  for (const label of ['取消', '确认']) {
    const button = within(dialog).queryByRole('button', { name: label });
    if (button) expect(button.querySelector('svg')).toBeNull();
  }
}

test('teacher edit opens a focused dialog and preserves teacher list navigation', async () => {
  const user = userEvent.setup();
  render(await TeachersPage({ searchParams: Promise.resolve({ q: '王', status: 'active', cursor: 'older' }) }));
  expect(screen.getByRole('heading', { name: '老师账号' })).toHaveClass('admin-page-title');
  expect(screen.getByRole('searchbox', { name: '搜索姓名或邮箱' })).toHaveValue('王');
  expect(screen.getByRole('searchbox', { name: '搜索姓名或邮箱' })).toHaveAttribute('placeholder', '输入老师名称或邮箱搜索');
  expect(screen.getByRole('combobox', { name: '账号状态' })).toHaveTextContent('启用中');
  expect(screen.getByRole('table', { name: '老师账号列表' })).toBeInTheDocument();
  const filterCard = screen.getByRole('searchbox', { name: '搜索姓名或邮箱' }).closest('[data-slot="card"]');
  const tableCard = screen.getByRole('table', { name: '老师账号列表' }).closest('[data-slot="card"]');
  expect(filterCard).not.toBeNull();
  expect(tableCard).not.toBeNull();
  expect(filterCard).not.toBe(tableCard);
  expect(filterCard?.querySelector('[data-slot="card-content"]')).not.toBeNull();
  expect(tableCard?.querySelector('[data-slot="card-content"] table')).not.toBeNull();
  expect(screen.getByRole('cell', { name: '王老师' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '创建老师' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/teachers?q=%E7%8E%8B&status=active&cursor=teacher-one&direction=next');
  expect(new FormData(screen.getByRole('searchbox', { name: '搜索姓名或邮箱' }).closest('form')!).has('cursor')).toBe(false);
  const edit = screen.getByRole('button', { name: '编辑王老师' });
  const password = screen.getByRole('button', { name: '修改王老师密码' });
  const disable = screen.getByRole('button', { name: '停用王老师账号' });
  expect(edit.closest('tr')).toBeInTheDocument();
  expect(edit.closest('tr')?.querySelectorAll('button')).toHaveLength(3);
  expect(edit.closest('tr')?.querySelector('.admin-row-actions')).not.toBeNull();
  expect(disable).toHaveClass('admin-row-action');
  expect(disable).toHaveAttribute('title', '停用王老师账号');
  await user.click(edit);
  const dialog = screen.getByRole('dialog', { name: '编辑老师' });
  expect(dialog).toHaveAttribute('data-state', 'open');
  expectDialogFooterTextOnly(dialog);
  expect(screen.getByRole('heading', { name: '账号资料' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '危险操作' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '停用账号' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '访问与安全' })).not.toBeInTheDocument();
  const name = screen.getByRole('textbox', { name: '姓名' });
  expect(name).toHaveValue('王老师');
  expect(name).toHaveFocus();
  expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveValue('wang@example.test');
  expect(dialog.querySelector('svg.lucide-user-round')).not.toBeNull();
  expect(dialog.querySelector('svg.lucide-mail')).not.toBeNull();
  expect(name.closest('div.w-full')).not.toBeNull();
  expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '新临时密码' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '关闭对话框' }));
  expect(screen.queryByRole('dialog', { name: '编辑老师' })).not.toBeInTheDocument();
  expect(edit).toHaveFocus();

  await user.click(password);
  const passwordDialog = screen.getByRole('dialog', { name: '修改老师密码' });
  expect(passwordDialog).toHaveAttribute('data-state', 'open');
  expectDialogFooterTextOnly(passwordDialog);
  expect(screen.getByLabelText('新临时密码')).toHaveAttribute('minLength', '8');
  expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
});

test('create teacher inputs include leading icons and remain clearable', async () => {
  const user = userEvent.setup();
  render(await TeachersPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '创建老师' }));
  const dialog = screen.getByRole('dialog', { name: '创建老师' });
  expectDialogFooterTextOnly(dialog);
  expect(within(dialog).getByRole('button', { name: '确认' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: '创建账号' })).not.toBeInTheDocument();

  expect(dialog.querySelector('svg.lucide-user-round')).not.toBeNull();
  expect(dialog.querySelector('svg.lucide-mail')).not.toBeNull();
  expect(dialog.querySelector('svg.lucide-lock-keyhole')).not.toBeNull();
  expect(screen.getByLabelText('姓名').closest('div.w-full')).not.toBeNull();
  expect(screen.getByLabelText('邮箱').closest('div.w-full')).not.toBeNull();
  expect(screen.getByLabelText('临时密码').closest('div.w-full')).not.toBeNull();
});
test('active teacher disable uses its own dialog without native confirmation', async () => {
  const user = userEvent.setup();
  vi.mocked(disableTeacherAction).mockResolvedValue({ ok: true, message: '老师账号已停用' });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(await TeachersPage({ searchParams: Promise.resolve({}) }));

  const row = screen.getByRole('cell', { name: '王老师' }).closest('tr');
  expect(row?.querySelectorAll('button')).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: '停用王老师账号' }));
  const dialog = screen.getByRole('dialog', { name: '停用老师账号' });
  expect(dialog).toHaveAttribute('data-state', 'open');
  expect(dialog).toHaveTextContent('停用后，王老师将无法登录此账号。');
  expectDialogFooterTextOnly(dialog);
  expect(within(dialog).getByRole('button', { name: '取消' })).toHaveClass('bg-workspace-surface');
  expect(within(dialog).getByRole('button', { name: '确认' })).toHaveClass('bg-workspace-accent');
  expect(confirm).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '确认' }));
  await vi.waitFor(() => expect(disableTeacherAction).toHaveBeenCalledOnce());
  const submitted = vi.mocked(disableTeacherAction).mock.calls[0][0];
  expect(submitted.get('teacherId')).toBe('teacher-one');
  expect(submitted.get('requestId')).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});
test('disabled teacher has no disable row action', async () => {
  vi.mocked(listTeachersPage).mockResolvedValueOnce({
    items: [{ id: 'teacher-one', name: '王老师', email: 'wang@example.test', banned: true, createdAt: new Date('2026-09-27T08:00:00Z') }],
    previousCursor: null,
    nextCursor: null,
  });
  render(await TeachersPage({ searchParams: Promise.resolve({}) }));

  const row = screen.getByRole('cell', { name: '王老师' }).closest('tr');
  expect(row?.querySelectorAll('button')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: '停用王老师账号' })).not.toBeInTheDocument();
});
test('clearing the teacher search resets the account status filter immediately', async () => {
  const user = userEvent.setup();
  render(await TeachersPage({ searchParams: Promise.resolve({ q: '王', status: 'disabled' }) }));

  const status = screen.getByRole('combobox', { name: '账号状态' });
  expect(status).toHaveTextContent('已停用');
  await user.click(screen.getByRole('button', { name: '清空输入内容' }));
  expect(status).toHaveTextContent('全部账号');
});

test('teacher search submits query and status without a separate reset action', async () => {
  render(await TeachersPage({ searchParams: Promise.resolve({ q: '王', status: 'disabled' }) }));
  const searchButton = screen.getByRole('button', { name: '查找' });
  const form = searchButton.closest('form')!;
  expect(form).toHaveAttribute('action', '/admin/teachers');
  expect(form).toHaveAttribute('method', 'get');
  expect(searchButton.querySelector('svg.lucide-search')).not.toBeNull();
  expect(screen.queryByRole('link', { name: /重置筛选|清除/ })).not.toBeInTheDocument();
  const data = new FormData(form);
  expect(data.get('q')).toBe('王');
  expect(data.get('status')).toBe('disabled');
  expect(data.has('cursor')).toBe(false);
});
test('saves teacher name and email together from the edit dialog', async () => {
  const user = userEvent.setup();
  vi.mocked(updateTeacherAction).mockResolvedValue({ ok: true, message: '老师资料已更新' });
  render(await TeachersPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '编辑王老师' }));
  await user.clear(screen.getByRole('textbox', { name: '姓名' }));
  await user.type(screen.getByRole('textbox', { name: '姓名' }), '王新老师');
  await user.clear(screen.getByRole('textbox', { name: '邮箱' }));
  await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'new@example.test');
  await user.click(screen.getByRole('button', { name: '确认' }));

  await vi.waitFor(() => expect(updateTeacherAction).toHaveBeenCalledOnce());
  const submitted = vi.mocked(updateTeacherAction).mock.calls[0][0];
  expect(submitted.get('teacherId')).toBe('teacher-one');
  expect(submitted.get('name')).toBe('王新老师');
  expect(submitted.get('email')).toBe('new@example.test');
});
