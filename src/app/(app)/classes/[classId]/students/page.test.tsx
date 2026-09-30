import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import StudentsPage from './page';
import { listStudents } from '../../../../../features/students/service';

vi.mock('../../../../../db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: '七年级一班' }]) }) }) }) } }));
vi.mock('../../../../../features/students/service', () => ({ listStudents: vi.fn() }));
vi.mock('../../../../../lib/access', () => ({ requireClassAccess: vi.fn() }));
vi.mock('../../../../../components/student-import', () => ({ StudentImport: () => <div role="region" aria-label="学生名单导入与维护" /> }));
afterEach(cleanup);

test('uses compact workspace heading and preserves the roster route composition', async () => {
  vi.mocked(listStudents).mockResolvedValue([{ id: 1, studentNumber: '001', name: '张三', gender: 'male', archived: false }] as never);
  render(await StudentsPage({ params: Promise.resolve({ classId: 'class-1' }) }));

  expect(screen.getByRole('navigation', { name: '班级工作区' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '七年级一班 · 学生' })).not.toHaveClass('border-l-4');
  expect(screen.getByRole('region', { name: '学生名单导入与维护' })).toBeInTheDocument();
  expect(screen.queryByText('导入、搜索并维护班级学生名单。')).not.toBeInTheDocument();
});
