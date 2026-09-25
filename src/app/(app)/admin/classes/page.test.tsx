import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ClassesPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../../../lib/workspace-guard', () => ({ requireAdminPage: async () => {} }));
vi.mock('../../../../features/classes/service', () => ({
  listClasses: async () => [{ id: 'class-one', name: '一班', archived: false,
    emblemPath: 'e2f93d54-2f1f-4ddc-9b12-ecba2f836801.png', teacherId: null, teacherName: null }],
  listTeachers: async () => [],
  listAdminAudit: async () => [],
}));
vi.mock('../../../../features/classes/actions', () => ({
  archiveClassAction: vi.fn(), assignTeacherAction: vi.fn(), createClassAction: vi.fn(),
  removeTeacherAction: vi.fn(), updateClassAction: vi.fn(), uploadEmblemAction: vi.fn(),
}));

test('administrator sees the protected emblem and can select a replacement', async () => {
  render(await ClassesPage());
  expect(screen.getByRole('img', { name: '一班班徽' })).toHaveAttribute('src',
    '/api/classes/class-one/emblem?v=e2f93d54-2f1f-4ddc-9b12-ecba2f836801.png');
  expect(screen.getByLabelText('上传班徽')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  expect(screen.getByRole('button', { name: '更新班徽' })).toBeInTheDocument();
});
