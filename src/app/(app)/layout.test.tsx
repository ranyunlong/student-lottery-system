import { expect, test, vi } from 'vitest';
import WorkspaceLayout from './layout';

const layoutMocks = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({ userId: 'user-1', role: 'teacher' as const })),
  getSession: vi.fn(async () => ({ user: { id: 'user-1', name: '周老师', email: 'zhou@example.com' } })),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/headers', () => ({ headers: layoutMocks.headers }));
vi.mock('../../lib/access', () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requireSession: layoutMocks.requireSession,
}));
vi.mock('../../lib/auth', () => ({ auth: { api: { getSession: layoutMocks.getSession } } }));

test('workspace layout passes current session name and email alongside the access-checked role', async () => {
  const children = <p>工作区</p>;
  const result = await WorkspaceLayout({ children });

  expect(layoutMocks.requireSession).toHaveBeenCalledOnce();
  expect(layoutMocks.getSession).toHaveBeenCalledOnce();
  expect(result.props).toMatchObject({ role: 'teacher', name: '周老师', email: 'zhou@example.com', children });
});
