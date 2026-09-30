import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { TeacherPicker } from './teacher-picker';
import { searchAssignableTeachersAction, searchPrimaryTeacherCandidatesAction } from '../features/classes/actions';

vi.mock('../features/classes/actions', () => ({
  searchAssignableTeachersAction: vi.fn(async () => [
    { id: 'teacher-one', name: '王老师', email: 'wang@example.test' },
  ]),
  searchPrimaryTeacherCandidatesAction: vi.fn(async () => [
    { id: 'primary-one', name: '李老师', email: 'li@example.test' },
  ]),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('defaults to teaching candidates and searches only after the administrator types', async () => {
  const user = userEvent.setup();
  render(<form><TeacherPicker classId="class-one" /></form>);
  expect(screen.getByRole('combobox', { name: '选择老师' })).toBeEnabled();
  expect(screen.getByRole('combobox', { name: '选择老师' }).closest('form')!.checkValidity()).toBe(false);
  expect(searchAssignableTeachersAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索老师' }), { target: { value: '王' } });
  await waitFor(() => expect(searchAssignableTeachersAction).toHaveBeenCalledWith('class-one', '王'));
  await user.click(screen.getByRole('combobox', { name: '选择老师' }));
  await user.click(await screen.findByRole('option', { name: '王老师 (wang@example.test)' }));
  expect(searchAssignableTeachersAction).toHaveBeenCalledWith('class-one', '王');
  expect(screen.getByRole('combobox', { name: '选择老师' })).toHaveTextContent('王老师');
});

test('uses the primary-candidate search for primary teacher mode', async () => {
  const user = userEvent.setup();
  render(<form><TeacherPicker classId="class-one" mode="primary" /></form>);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索老师' }), { target: { value: '李' } });

  await waitFor(() => expect(searchPrimaryTeacherCandidatesAction).toHaveBeenCalledWith('class-one', '李'));
  await user.click(screen.getByRole('combobox', { name: '选择老师' }));
  await user.click(await screen.findByRole('option', { name: '李老师 (li@example.test)' }));
  expect(searchPrimaryTeacherCandidatesAction).toHaveBeenCalledWith('class-one', '李');
  expect(screen.getByRole('combobox', { name: '选择老师' })).toHaveTextContent('李老师');
  expect(searchAssignableTeachersAction).not.toHaveBeenCalled();
});

test('uses shared field and status semantics for teacher search failures', async () => {
  vi.mocked(searchAssignableTeachersAction).mockRejectedValueOnce(new Error('offline'));
  render(<form><TeacherPicker classId="class-one" /></form>);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索老师' }), { target: { value: '王' } });
  const error = await screen.findByRole('alert');
  expect(error).toHaveClass('border-workspace-danger/20', 'bg-workspace-danger-soft');
});

test('clears the candidate search when the assignment form resets after success', async () => {
  const user = userEvent.setup();
  render(<form><TeacherPicker classId="class-one" /></form>);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索老师' }), { target: { value: '王' } });
  await waitFor(() => expect(searchAssignableTeachersAction).toHaveBeenCalledWith('class-one', '王'));
  await user.click(screen.getByRole('combobox', { name: '选择老师' }));
  await user.click(await screen.findByRole('option', { name: '王老师 (wang@example.test)' }));
  fireEvent.reset(screen.getByRole('searchbox', { name: '搜索老师' }).closest('form')!);
  expect(screen.getByRole('searchbox', { name: '搜索老师' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: '选择老师' })).toHaveTextContent('暂无候选老师');
  expect(screen.queryByRole('option', { name: '王老师 (wang@example.test)' })).not.toBeInTheDocument();
});
