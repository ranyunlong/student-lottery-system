import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

test('paste preview shows row errors, blocks confirmation and invalidates stale preview on edit', async () => {
  render(<StudentImport classId="class-one" students={roster} />);
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
  expect(screen.getByText('李四')).toBeInTheDocument();
  expect(screen.queryByText('张三')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '恢复李四' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('搜索名单'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: '归档张三' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '恢复李四' }));
  await waitFor(() => expect(restoreStudentAction).toHaveBeenCalled());
  expect(archiveStudentAction).not.toHaveBeenCalled();
});
