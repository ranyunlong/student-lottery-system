import { expect, test, vi } from 'vitest';

vi.mock('./access', () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requireAdmin: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));

import { requireAdminPage, requireTeacherPage } from './workspace-guard';
import { ForbiddenError, requireAdmin, requireSession } from './access';
import { redirect } from 'next/navigation';

test('admin page redirects unauthenticated callers without rendering protected data', async () => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new ForbiddenError('请先登录'));
  await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledWith('/login');
});

test('admin page redirects teachers to their workspace', async () => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new ForbiddenError('需要管理员权限'));
  await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledWith('/teacher');
});

test('teacher page redirects administrators without listing classes', async () => {
  vi.mocked(requireSession).mockResolvedValueOnce({ userId: 'admin', role: 'admin' });
  await expect(requireTeacherPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledWith('/admin/teachers');
});
