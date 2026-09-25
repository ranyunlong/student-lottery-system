import { expect, test, vi } from 'vitest';
import Page from './page';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../lib/access', () => ({ requireSession: vi.fn() }));

test('sends an administrator to the administrator workspace', async () => {
  const { requireSession } = await import('../lib/access');
  const { redirect } = await import('next/navigation');
  vi.mocked(requireSession).mockResolvedValue({ userId: 'admin', role: 'admin' });
  await Page();
  expect(redirect).toHaveBeenCalledWith('/admin/teachers');
});

test('sends a teacher to their own workspace', async () => {
  const { requireSession } = await import('../lib/access');
  const { redirect } = await import('next/navigation');
  vi.mocked(requireSession).mockResolvedValue({ userId: 'teacher', role: 'teacher' });
  await Page();
  expect(redirect).toHaveBeenCalledWith('/teacher');
});
