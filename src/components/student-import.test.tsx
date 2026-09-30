import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StudentImport } from './student-import';
import { importPastedStudentsAction, archiveStudentAction, restoreStudentAction } from '../features/students/actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../features/students/actions', () => ({
  importPastedStudentsAction: vi.fn(async () => ({ ok: true, message: '完成', inserted: 1, updated: 0 })),
  archiveStudentAction: vi.fn(async () => ({ ok: true, message: '已归档' })),
  restoreStudentAction: vi.fn(async () => ({ ok: true, message: '已恢复' })),
}));
const roster = [
  { id: 1, studentNumber: '001', name: '张三', gender: 'male' as const, archived: false },
  { id: 2, studentNumber: '002', name: '李四', gender: null, archived: true },
];
function renderWithImportOpen() {
  render(<StudentImport classId="class-one" students={roster} />);
  fireEvent.click(screen.getByRole('button', { name: '导入学生' }));
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

test('opens student import in a dialog with Excel template and paste mode available', () => {
  render(<StudentImport classId="class-one" students={roster} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导入学生' }));
  expect(screen.getByRole('dialog', { name: '导入学生' })).toBeInTheDocument();
  const heading = within(screen.getByRole('dialog')).getByRole('heading', { name: '导入学生' });
  expect(heading.closest('div.border-b')).toContainElement(screen.getByText('每批最多 5,000 人'));
  expect(screen.getByText('每批最多 5,000 人').parentElement).toHaveClass('justify-end');
  const template = screen.getByRole('link', { name: '下载 Excel 模板' });
  expect(template).toHaveAttribute('href', '/api/classes/class-one/students/import');
  expect(template).toHaveAttribute('download');
  expect(screen.getByLabelText('选择 Excel 文件')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '粘贴导入' }));
  expect(screen.queryByRole('link', { name: '下载 Excel 模板' })).not.toBeInTheDocument();
});

test('keeps roster table label for accessibility without the duplicate visible heading and count', () => {
  render(<StudentImport classId="class-one" students={roster} />);
  expect(screen.getByRole('button', { name: '导入学生' }).parentElement).toHaveClass('justify-end');
  expect(screen.queryByRole('heading', { name: '学生名单' })).not.toBeInTheDocument();
  expect(screen.getByRole('table', { name: '学生名单' })).toBeInTheDocument();
  expect(screen.queryByText('2 人')).not.toBeInTheDocument();
});

test('late Excel 422 confirmation cannot restore A preview or error after selecting B', async () => {
  let finishConfirm!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finishConfirm = resolve; });
  let finishBPreview!: (response: Response) => void;
  const pendingB = new Promise<Response>((resolve) => { finishBPreview = resolve; });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ studentNumber: 'A', name: '甲', gender: null }], errors: [],
    }), { status: 200 }))
    .mockReturnValueOnce(pending)
    .mockReturnValueOnce(pendingB);
  vi.stubGlobal('fetch', fetchMock);
  try {
    renderWithImportOpen();
    const input = screen.getByLabelText('选择 Excel 文件');
    const fileA = new File(['A'], 'A.xlsx');
    const fileB = new File(['B'], 'B.xlsx');
    fireEvent.change(input, { target: { files: [fileA] } });
    fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
    expect(await screen.findByText('甲')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1].body as FormData).get('file')).toBe(fileA);
    fireEvent.change(input, { target: { files: [fileB] } });
    const previewButton = screen.getByRole('button', { name: '预览名单' });
    expect(previewButton).toBeEnabled();
    fireEvent.click(previewButton);
    expect((fetchMock.mock.calls[2][1].body as FormData).get('file')).toBe(fileB);
    await act(async () => finishConfirm(new Response(JSON.stringify({
      rows: [], errors: [{ line: 2, message: 'A 文件错误' }],
    }), { status: 422 })));
    expect(screen.queryByText('A 文件错误')).not.toBeInTheDocument();
    expect(screen.queryByText('文件有错误，请重新预览')).not.toBeInTheDocument();
    expect(screen.queryByText('甲')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认导入' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
    await act(async () => finishBPreview(new Response(JSON.stringify({
      rows: [{ studentNumber: 'B', name: '乙', gender: null }], errors: [],
    }), { status: 200 })));
    expect(screen.getByText('乙')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览名单' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

test('late Excel success cannot report A imported in the paste tab', async () => {
  let finishConfirm!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { finishConfirm = resolve; });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ studentNumber: 'A', name: '甲', gender: null }], errors: [],
    }), { status: 200 }))
    .mockReturnValueOnce(pending);
  vi.stubGlobal('fetch', fetchMock);
  try {
    renderWithImportOpen();
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [new File(['A'], 'A.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
    expect(await screen.findByText('甲')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: '确认导入' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('tab', { name: '粘贴导入' }));
    fireEvent.change(screen.getByLabelText('粘贴学生数据'), { target: { value: 'B\t乙\t女' } });
    expect(screen.getByRole('button', { name: '预览名单' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
    expect(screen.getByText('乙')).toBeInTheDocument();
    await act(async () => finishConfirm(new Response(JSON.stringify({ inserted: 1, updated: 0 }), { status: 200 })));
    expect(screen.getByLabelText('粘贴学生数据')).toHaveValue('B\t乙\t女');
    expect(screen.getByText('乙')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('甲')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览名单' })).toBeEnabled();
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

test('a stale Excel preview cannot reappear after selecting another file or confirm that other file', async () => {
  let finishFirst!: (response: Response) => void;
  const first = new Promise<Response>((resolve) => { finishFirst = resolve; });
  const previewResponse = (name: string) => new Response(JSON.stringify({
    rows: [{ studentNumber: name, name, gender: null }], errors: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetchMock = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(previewResponse('新文件'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ inserted: 1, updated: 0 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    renderWithImportOpen();
    const input = screen.getByLabelText('选择 Excel 文件');
    const oldFile = new File(['old'], 'old.xlsx');
    const newFile = new File(['new'], 'new.xlsx');
    fireEvent.change(input, { target: { files: [oldFile] } });
    fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { files: [newFile] } });
    finishFirst(previewResponse('旧文件'));
    await waitFor(() => expect(screen.getByRole('button', { name: '预览名单' })).toBeEnabled());
    expect(screen.queryAllByText('旧文件')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '确认导入' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
    expect(await screen.findAllByText('新文件')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect((fetchMock.mock.calls[1][1].body as FormData).get('file')).toBe(newFile);
    expect((fetchMock.mock.calls[2][1].body as FormData).get('file')).toBe(newFile);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('paste preview shows row errors, blocks confirmation and invalidates stale preview on edit', async () => {
  renderWithImportOpen();
  fireEvent.click(screen.getByRole('tab', { name: '粘贴导入' }));
  fireEvent.change(screen.getByLabelText('粘贴学生数据'), { target: { value: '003\t王五\t男\n003\t重复\t女' } });
  fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
  expect(screen.getByRole('alert')).toHaveTextContent('第 2 行');
  expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('粘贴学生数据'), { target: { value: '003\t王五\t男' } });
  expect(screen.queryByText('王五')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
  expect(screen.getByText('王五')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
  await waitFor(() => expect(importPastedStudentsAction).toHaveBeenCalled());
  const data = vi.mocked(importPastedStudentsAction).mock.calls[0][0];
  expect(data.get('text')).toBe('003\t王五\t男');
  expect(data.has('rows')).toBe(false);
  expect(await screen.findByRole('status')).toHaveTextContent('新增 1');
  expect(refresh).toHaveBeenCalled();
});

test('searches and filters roster and names explicit archive/restore actions', async () => {
  render(<StudentImport classId="class-one" students={roster} />);
  fireEvent.change(screen.getByLabelText('搜索名单'), { target: { value: '002' } });
  expect(screen.getByText('张三')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查找' }));
  expect(screen.getByText('李四')).toBeInTheDocument();
  expect(screen.queryByText('张三')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '恢复李四' })).toBeInTheDocument();
  const rosterTable = screen.getByRole('table', { name: '学生名单' });
  expect(rosterTable).toHaveClass('min-w-[56rem]');
  expect(rosterTable.querySelector('thead')).not.toHaveClass('max-[1024px]:sr-only');
  expect(rosterTable.closest('div.overflow-x-auto')).toBeInTheDocument();
  const rosterSearch = screen.getByLabelText('搜索名单');
  expect(rosterSearch.closest('label')?.parentElement?.parentElement).toHaveClass('rounded-md', 'border', 'bg-workspace-surface');
  const row = within(rosterTable).getByRole('row', { name: /李四/ });
  expect(within(row).getAllByRole('cell')).toHaveLength(5);
  expect(within(row).getByText('002')).toBeInTheDocument();
  expect(within(row).getByText('李四')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('搜索名单'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: '归档张三' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '恢复李四' }));
  await waitFor(() => expect(restoreStudentAction).toHaveBeenCalled());
  expect(archiveStudentAction).not.toHaveBeenCalled();
});

test('archives a student only after confirmation in a custom dialog', async () => {
  render(<StudentImport classId="class-one" students={roster} />);
  const nativeConfirm = vi.spyOn(window, 'confirm');
  fireEvent.click(screen.getByRole('button', { name: '归档张三' }));
  const dialog = screen.getByRole('dialog', { name: '归档学生：张三' });
  expect(within(dialog).getByText(/归档后/)).toBeInTheDocument();
  expect(archiveStudentAction).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '归档学生：张三' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '归档张三' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '归档学生：张三' })).getByRole('button', { name: '确认' }));
  await waitFor(() => expect(archiveStudentAction).toHaveBeenCalledOnce());
  const submitted = vi.mocked(archiveStudentAction).mock.calls[0][0] as FormData;
  expect(submitted.get('classId')).toBe('class-one');
  expect(submitted.get('studentId')).toBe('1');
  expect(nativeConfirm).not.toHaveBeenCalled();
  nativeConfirm.mockRestore();
});

test('each student links to their own pending prizes by student id', () => {
  render(<StudentImport classId="class-one" students={roster} />);
  const table = screen.getByRole('table', { name: '学生名单' });
  const first = within(table).getByRole('row', { name: /张三/ });
  const second = within(table).getByRole('row', { name: /李四/ });
  expect(within(first).getByRole('link', { name: '查看张三待兑换奖品' }))
    .toHaveAttribute('href', '/classes/class-one/winnings?studentId=1');
  expect(within(second).getByRole('link', { name: '查看李四待兑换奖品' }))
    .toHaveAttribute('href', '/classes/class-one/winnings?studentId=2');
});

test('search button filters, while the separate close icon is absent', async () => {
  const user = userEvent.setup();
  render(<StudentImport classId="class-one" students={roster} />);
  const status = screen.getByLabelText('状态');
  await user.click(status);
  await user.click(await screen.findByRole('option', { name: '已归档' }));
  fireEvent.change(screen.getByLabelText('搜索名单'), { target: { value: '002' } });
  fireEvent.click(screen.getByRole('button', { name: '查找' }));
  expect(screen.getByText('李四')).toBeInTheDocument();
  expect(screen.queryByText('张三')).not.toBeInTheDocument();

  expect(screen.queryByRole('button', { name: '清空搜索' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('搜索名单'), { target: { value: '' } });
  expect(status).toHaveTextContent('全部');
  expect(screen.getByLabelText('搜索名单')).toHaveValue('');
  expect(screen.getByText('李四')).toBeInTheDocument();
  expect(screen.getByText('张三')).toBeInTheDocument();
});

test('native search clear resets the status filter to all', async () => {
  const user = userEvent.setup();
  render(<StudentImport classId="class-one" students={roster} />);
  const status = screen.getByLabelText('状态');
  const search = screen.getByLabelText('搜索名单');
  await user.click(status);
  await user.click(await screen.findByRole('option', { name: '已归档' }));
  fireEvent.change(search, { target: { value: '002' } });
  fireEvent.click(screen.getByRole('button', { name: '查找' }));
  expect(screen.queryByText('张三')).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: '' } });
  expect(status).toHaveTextContent('全部');
  expect(screen.getByText('李四')).toBeInTheDocument();
  expect(screen.getByText('张三')).toBeInTheDocument();
});

test('large paste preview paginates row errors without rendering every error', async () => {
  renderWithImportOpen();
  fireEvent.click(screen.getByRole('tab', { name: '粘贴导入' }));
  fireEvent.change(screen.getByLabelText('粘贴学生数据'), { target: {
    value: Array.from({ length: 200 }, () => '\t未命名\t').join('\n'),
  } });
  fireEvent.click(screen.getByRole('button', { name: '预览名单' }));
  const errors = screen.getByRole('alert');
  expect(errors.querySelectorAll('li')).toHaveLength(100);
  fireEvent.click(screen.getByRole('button', { name: '下一组错误' }));
  expect(errors.querySelectorAll('li')).toHaveLength(100);
  expect(errors).toHaveTextContent('第 101 行');
});
