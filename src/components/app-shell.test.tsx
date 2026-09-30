import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from './app-shell';

const mocks = vi.hoisted(() => ({ pathname: '/classes/room-1/students', push: vi.fn(), refresh: vi.fn(), signOut: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ signOut: mocks.signOut }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('teacher shell shows the name above the role without exposing email', () => {
  render(<AppShell role="teacher" name="周老师" email="zhou@example.com"><div>Content</div></AppShell>);
  expect(screen.getByText('幸运游园会')).toBeInTheDocument();
  expect(within(screen.getByRole('banner')).getByText('园丁工作区')).toBeInTheDocument();
  const identity = screen.getByText('周老师').parentElement;
  expect(identity?.children[0]).toHaveTextContent('周老师');
  expect(identity?.children[1]).toHaveTextContent('园丁');
  expect(screen.queryByText('zhou@example.com')).not.toBeInTheDocument();
  const workspaceLink = within(screen.getByRole('navigation', { name: '\u5de5\u4f5c\u533a' })).getByRole('link', { name: '\u56ed\u4e01\u5de5\u4f5c\u533a' });
  expect(workspaceLink).toHaveAttribute('href', '/teacher');
  expect(workspaceLink).toHaveAttribute('aria-current', 'page');
});

test('class routes activate only the teacher workspace, including the teacher landing route', () => {
  mocks.pathname = '/classes/class-1/students';
  const { rerender } = render(<AppShell role="admin" name="管理员" email="admin@example.com"><div>Content</div></AppShell>);
  expect(screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(0);

  mocks.pathname = '/teacher';
  rerender(<AppShell role="teacher" name="老师" email="teacher@example.com"><div>Content</div></AppShell>);
  expect(within(screen.getByRole('navigation', { name: '\u5de5\u4f5c\u533a' })).getByRole('link', { name: '\u56ed\u4e01\u5de5\u4f5c\u533a' })).toHaveAttribute('aria-current', 'page');
});

test('admin shell preserves its links and active navigation', () => {
  mocks.pathname = '/admin/classes';
  render(<AppShell role="admin" name="校务账号" email="admin@example.com"><div>Content</div></AppShell>);
  expect(screen.getByRole('main').parentElement?.parentElement).toHaveAttribute('data-workspace-role', 'admin');
  expect(screen.getByText('\u7ba1\u7406\u5458')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /\u8001\u5e08\u8d26\u53f7/ })).toHaveAttribute('href', '/admin/teachers');
  expect(screen.getByRole('link', { name: /\u73ed\u7ea7\u7ba1\u7406/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /\u5ba1\u8ba1\u8bb0\u5f55/ })).toHaveAttribute('href', '/admin/audit');
  expect(screen.getByRole('navigation', { name: '\u5de5\u4f5c\u533a' })).toHaveClass('md:flex-col');
  expect(screen.getByRole('banner')).toHaveClass('admin-fair-header');
  expect(screen.getByRole('banner').querySelector('a[href="/"] > span[aria-hidden="true"]')).toHaveTextContent('幸');
  expect(screen.getByRole('navigation', { name: '\u5de5\u4f5c\u533a' })).toHaveClass('admin-fair-nav');
});

test('sign out calls auth and returns to login before refreshing', async () => {
  mocks.signOut.mockResolvedValue(undefined);
  render(<AppShell role="teacher" name="老师" email="teacher@example.com"><div>Content</div></AppShell>);
  fireEvent.click(screen.getByRole('button', { name: '\u9000\u51fa\u767b\u5f55' }));
  expect(mocks.signOut).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(mocks.push).toHaveBeenCalledWith('/login');
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
