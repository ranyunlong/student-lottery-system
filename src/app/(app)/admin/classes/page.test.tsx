import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ClassesPage from './page';
import { archiveClassAction, updateClassAction, searchPrimaryTeacherCandidatesAction } from '../../../../features/classes/actions';
import { listClassesPage } from '../../../../features/classes/service';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('../../../../lib/workspace-guard', () => ({ requireAdminPage: async () => {} }));
vi.mock('../../../../features/classes/service', () => ({
  listClassesPage: vi.fn(async ({ status, search }: { status: string; search: string }) => ({ items: [
    { id: 'class-one', name: '一班', archived: false, emblemPath: 'e2f93d54-2f1f-4ddc-9b12-ecba2f836801.png',
      members: [
        { id: 'teacher-primary', name: '主任老师', role: 'primary' },
        { id: 'teacher-one', name: '任课老师甲', role: 'teaching' },
        { id: 'teacher-two', name: '任课老师乙', role: 'teaching' },
      ], createdAt: new Date('2026-09-27T08:00:00Z') },
    { id: 'class-old', name: '毕业班', archived: true, emblemPath: null,
      members: [{ id: 'teacher-old', name: '历史老师', role: 'teaching' }], createdAt: new Date('2025-09-01T08:00:00Z') },
  ].filter((item) => (status === 'all' || (status === 'archived') === item.archived) && item.name.startsWith(search)), previousCursor: 'class-first', nextCursor: 'class-last' })),
  listRecentAdminAudit: async () => [{ id: 'audit-primary', actorId: 'admin-one', action: 'class.teacher.primary.set',
    targetUserId: 'teacher-primary', classId: 'class-one', details: {}, createdAt: new Date('2026-09-27T09:00:00Z') }],
}));
vi.mock('../../../../features/classes/actions', () => ({
  archiveClassAction: vi.fn(async () => ({ ok: true, message: '班级已归档' })),
  assignTeacherAction: vi.fn(async () => ({ ok: true, message: '老师已分配' })),
  createClassAction: vi.fn(), removeTeacherAction: vi.fn(async () => ({ ok: true, message: '老师分配已移除' })), setPrimaryTeacherAction: vi.fn(async () => ({ ok: true, message: '班主任已更新' })),
  updateClassAction: vi.fn(), uploadEmblemAction: vi.fn(),
  searchAssignableTeachersAction: vi.fn(async () => []), searchPrimaryTeacherCandidatesAction: vi.fn(async () => []),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(updateClassAction).mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
afterEach(cleanup);

test('opens a role-aware class edit dialog while preserving roster and cursor filter navigation', async () => {
  const user = userEvent.setup();
  render(await ClassesPage({ searchParams: Promise.resolve({ q: '一', status: 'active', cursor: 'older' }) }));

  const table = screen.getByRole('table', { name: '班级列表' });
  const classRow = screen.getByRole('row', { name: /一班/ });
  const rowArchiveTrigger = within(classRow).getByRole('button', { name: '归档班级一班' });
  expect(rowArchiveTrigger).toHaveAttribute('title', '归档班级一班');
  expect(rowArchiveTrigger).toHaveClass('admin-row-action');
  expect(rowArchiveTrigger).not.toHaveTextContent('归档');
  expect(rowArchiveTrigger.parentElement).toHaveClass('admin-row-actions', 'flex-nowrap', 'whitespace-nowrap');
  expect(screen.getByRole('heading', { name: '班级管理' })).toHaveClass('admin-page-title');
  expect(screen.getByRole('heading', { name: '班级管理' }).parentElement?.parentElement).toHaveClass('admin-page-heading');
  expect(screen.getByText('班级列表 · 每页 20 条')).toHaveClass('admin-page-subtitle');
  expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
  const filterCard = screen.getByRole('searchbox', { name: '搜索班级名称' }).closest<HTMLElement>('[data-slot="card"]');
  expect(screen.getByRole('searchbox', { name: '搜索班级名称' })).toHaveAttribute('placeholder', '请输入班级名称搜索');
  const tableCard = table.closest<HTMLElement>('[data-slot="card"]');
  expect(filterCard).not.toBeNull();
  expect(filterCard).toHaveClass('admin-filter-panel');
  expect(tableCard).not.toBeNull();
  expect(filterCard).not.toBe(tableCard);
  expect(filterCard).not.toContainElement(tableCard);
  expect(filterCard?.querySelector('[data-slot="card-content"]')).not.toBeNull();
  expect(tableCard?.querySelector('[data-slot="card-content"] table')).not.toBeNull();
  const filterForm = screen.getByRole('button', { name: '查找' }).closest('form')!;
  expect(filterForm).toHaveClass('admin-filter-form');
  expect(within(filterForm).getByRole('button', { name: '查找' })).toHaveClass('bg-workspace-accent');
  expect(filterForm).not.toHaveClass('border-y', 'border-workspace-line', 'py-3');
  expect(table.parentElement).toHaveClass('relative', 'w-full', 'overflow-x-auto');
  expect(tableCard).toContainElement(table.parentElement);
  expect(screen.queryByRole('heading', { name: '最近管理记录' })).not.toBeInTheDocument();
  expect(screen.queryByText('设置主负责老师')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '查看全部' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: '一班班徽' })).toHaveAttribute('src',
    '/api/classes/class-one/emblem?v=e2f93d54-2f1f-4ddc-9b12-ecba2f836801.png');
  expect(within(classRow).getByText('班主任')).toBeInTheDocument();
  const rosterLink = screen.getByRole('link', { name: '查看一班学生名单' });
  expect(rosterLink).toHaveAttribute('href', '/classes/class-one/students');
  expect(rosterLink).toHaveAttribute('title', '查看一班学生名单');
  expect(rosterLink).toHaveClass('admin-row-action');
  expect(rosterLink.parentElement).toHaveClass('admin-row-actions');
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/classes?q=%E4%B8%80&status=active&cursor=class-last&direction=next');
  expect(new FormData(screen.getByRole('searchbox', { name: '搜索班级名称' }).closest('form')!).has('cursor')).toBe(false);

  const editTrigger = screen.getByRole('button', { name: '编辑班级一班' });
  expect(within(classRow).getByRole('button', { name: '编辑班级一班' })).toBeInTheDocument();
  expect(editTrigger.querySelector('svg')).toBeInTheDocument();
  expect(editTrigger).not.toHaveTextContent('编辑');
  expect(editTrigger).toBeEnabled();
  expect(editTrigger).toHaveAccessibleName('编辑班级一班');
  expect(editTrigger).toHaveClass('admin-row-action');
  expect(editTrigger.parentElement).toHaveClass('admin-row-actions');
  await user.click(editTrigger);
  const dialog = screen.getByRole('dialog', { name: '编辑班级：一班' });
  expect(dialog).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: '归档班级一班' })).not.toBeInTheDocument();
  const editorScrollArea = dialog.querySelector('[data-class-editor-scroll]');
  expect(editorScrollArea).not.toBeNull();
  expect(editorScrollArea).toHaveClass('overflow-y-auto');
  expect(editorScrollArea).toHaveClass('px-3');
  expect(dialog).toHaveAttribute('data-state', 'open');
  expect(screen.getByRole('textbox', { name: '班级名称' })).toHaveValue('一班');
  expect(screen.getByLabelText('班徽')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  expect(screen.getByRole('heading', { name: '班级资料' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '老师配置' })).toBeInTheDocument();
  expect(within(dialog).getByText('主任老师')).toBeInTheDocument();
  expect(within(dialog).getByText('任课老师甲')).toBeInTheDocument();
  expect(within(dialog).getByText('任课老师乙')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认' }).querySelector('svg')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '取消' }).querySelector('svg')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '取消' }).parentElement).toHaveClass('justify-end');
  expect(screen.getAllByRole('button', { name: '确认' })).toHaveLength(1);
  expect(within(dialog).getByText('班主任')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '设为班主任：任课老师甲' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '移除任课老师乙' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: '归档班级' })).not.toBeInTheDocument();

  const teacherSearch = screen.getByRole('searchbox', { name: '搜索老师' });
  await user.type(teacherSearch, '候选老师');
  await waitFor(() => expect(searchPrimaryTeacherCandidatesAction).toHaveBeenCalledWith('class-one', '候选老师'));
  await user.click(within(teacherSearch.parentElement!).getByRole('button', { name: '清空输入内容' }));
  expect(teacherSearch).toHaveValue('');
  expect(screen.queryByText('正在搜索老师…')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '关闭对话框' }));
  const createTrigger = screen.getByRole('button', { name: '创建班级' });
  expect(createTrigger).toBeEnabled();
  expect(createTrigger).toHaveAccessibleName('创建班级');
  expect(createTrigger.querySelector('.lucide-plus')).toBeInTheDocument();
  await user.click(createTrigger);
  const createDialog = screen.getByRole('dialog', { name: '创建班级' });
  expect(createDialog).toBeVisible();
  expect(createDialog).toHaveAttribute('data-state', 'open');
  expect(within(createDialog).getByRole('button', { name: '取消' }).querySelector('svg')).not.toBeInTheDocument();
  expect(within(createDialog).getByRole('button', { name: '确认' }).querySelector('svg')).not.toBeInTheDocument();
  expect(within(createDialog).getByRole('button', { name: '取消' }).parentElement).toHaveClass('justify-end');
  const createName = within(createDialog).getByRole('textbox', { name: '班级名称' });
  expect(createName.parentElement?.querySelector('.lucide-school')).toBeInTheDocument();
  await user.type(createName, '新班级');
  await user.click(within(createDialog).getByRole('button', { name: '清空输入内容' }));
  expect(createName).toHaveValue('');
});

test('clearing the native class search resets the status filter immediately', async () => {
  const user = userEvent.setup();
  render(await ClassesPage({ searchParams: Promise.resolve({ q: '一', status: 'archived' }) }));

  const status = screen.getByRole('combobox', { name: '班级状态' });
  expect(status).toHaveTextContent('已归档');
  await user.click(screen.getByRole('button', { name: '清空输入内容' }));
  expect(status).toHaveTextContent('全部班级');
});

test('clear control resets unsubmitted class search and status controls', async () => {
  const user = userEvent.setup();
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  const form = screen.getByRole('button', { name: '查找' }).closest('form')!;
  const search = form.querySelector('input[type="search"]')!;
  const status = within(form).getByRole('combobox', { name: '班级状态' });
  await user.type(search, 'unsubmitted class');
  await user.click(within(form).getByRole('button', { name: '清空输入内容' }));
  expect(search).toHaveValue('');
  expect(status).toHaveTextContent('全部班级');
  expect(within(form).queryByRole('link', { name: /清除|重置/ })).not.toBeInTheDocument();
});

test('submits class fields and teacher assignments in one form', async () => {
  const user = userEvent.setup();
  vi.mocked(updateClassAction).mockResolvedValue({ ok: true, message: '班级设置已保存' });
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '编辑班级一班' }));

  await user.clear(screen.getByRole('textbox', { name: '班级名称' }));
  await user.type(screen.getByRole('textbox', { name: '班级名称' }), '一班新名');
  await user.click(screen.getByRole('button', { name: '设为班主任：任课老师甲' }));
  await user.click(screen.getByRole('button', { name: '确认' }));

  await waitFor(() => expect(updateClassAction).toHaveBeenCalledOnce());
  const submitted = vi.mocked(updateClassAction).mock.calls[0][0];
  expect(submitted.get('classId')).toBe('class-one');
  expect(submitted.get('name')).toBe('一班新名');
  expect(submitted.get('primaryTeacherId')).toBe('teacher-one');
  expect(submitted.getAll('teachingTeacherIds')).toEqual(['teacher-primary', 'teacher-two']);
});

test('clears the uncontrolled class name and cancels without submitting', async () => {
  const user = userEvent.setup();
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '编辑班级一班' }));
  const dialog = screen.getByRole('dialog', { name: '编辑班级：一班' });
  const name = within(dialog).getByRole('textbox', { name: '班级名称' });

  await user.click(within(dialog).getByRole('button', { name: '清空输入内容' }));
  expect(name).toHaveValue('');
  await user.click(within(dialog).getByRole('button', { name: '取消' }));

  expect(dialog).not.toBeVisible();
  expect(updateClassAction).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '编辑班级一班' })).toHaveFocus();
});

test('keeps archived classes readable but removes all mutation controls', async () => {
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));

  const archivedRow = screen.getByRole('row', { name: /毕业班/ });
  expect(within(archivedRow).getByRole('link', { name: '查看毕业班学生名单' })).toHaveAttribute('href', '/classes/class-old/students');
  expect(within(archivedRow).queryByRole('button')).not.toBeInTheDocument();
  expect(within(archivedRow).queryByRole('button', { name: '编辑班级毕业班' })).not.toBeInTheDocument();
  expect(within(archivedRow).getByText('已归档')).toBeInTheDocument();
  expect(within(archivedRow).getByText('历史老师')).toBeInTheDocument();
  expect(within(archivedRow).getByText('未设置班主任')).toBeInTheDocument();
});

test('archive action opens a separate confirmation dialog and can be canceled', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm');
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  const archiveTrigger = screen.getByRole('button', { name: '归档班级一班' });
  await user.click(archiveTrigger);
  const dialog = screen.getByRole('dialog', { name: '归档班级：一班' });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByText(/归档后班级资料和老师分配将不可再编辑/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '取消' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '确认' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '取消' }).querySelector('svg')).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '确认' }).querySelector('svg')).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(dialog).not.toBeVisible();
  expect(archiveClassAction).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

test('keeps roster removals as a draft until the single class save is submitted', async () => {
  const user = userEvent.setup();
  vi.mocked(updateClassAction).mockResolvedValue({ ok: true, message: '班级设置已保存' });
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '编辑班级一班' }));
  const dialog = screen.getByRole('dialog', { name: '编辑班级：一班' });
  await user.click(screen.getByRole('button', { name: '移除主任老师' }));
  expect(updateClassAction).not.toHaveBeenCalled();
  expect(within(dialog).queryByText('主任老师')).not.toBeInTheDocument();
  expect(dialog).toBeVisible();
  await user.click(screen.getByRole('button', { name: '确认' }));

  await waitFor(() => expect(updateClassAction).toHaveBeenCalledOnce());
  expect(vi.mocked(updateClassAction).mock.calls[0][0].get('primaryTeacherId')).toBe('');
  expect(dialog).not.toBeVisible();
  expect(screen.getByRole('button', { name: '编辑班级一班' })).toHaveFocus();
});

test('does not save class settings when the staged emblem upload fails', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('班徽不能超过 2 MiB', { status: 400 }));
  render(await ClassesPage({ searchParams: Promise.resolve({}) }));
  await user.click(screen.getByRole('button', { name: '编辑班级一班' }));
  const file = new File([new Uint8Array([1, 2, 3])], 'mark.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('班徽'), file);
  await user.click(screen.getByRole('button', { name: '确认' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('班级资料及教师配置尚未保存');
  expect(fetchSpy).toHaveBeenCalledOnce();
  expect(updateClassAction).not.toHaveBeenCalled();
});

test('keeps archive confirmation and returns to the current filter with visible feedback', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm');
  render(await ClassesPage({ searchParams: Promise.resolve({ q: '一', status: 'active', cursor: 'older' }) }));
  const trigger = screen.getByRole('button', { name: '归档班级一班' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: '归档班级：一班' })).toBeVisible();
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '确认' }));

  await waitFor(() => expect(archiveClassAction).toHaveBeenCalledOnce());
  expect(vi.mocked(archiveClassAction).mock.calls[0][0].get('classId')).toBe('class-one');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/classes?q=%E4%B8%80&status=active&notice=archived'));
  expect(trigger).toHaveFocus();
});

test('shows archive feedback when the active filter no longer returns the class', async () => {
  vi.mocked(listClassesPage).mockResolvedValueOnce({ items: [], previousCursor: null, nextCursor: null });
  render(await ClassesPage({ searchParams: Promise.resolve({ q: '一', status: 'active', notice: 'archived' }) }));

  expect(screen.getByRole('status')).toHaveTextContent('班级已归档');
  expect(screen.getByText('没有符合条件的班级。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '编辑班级一班' })).not.toBeInTheDocument();
});
