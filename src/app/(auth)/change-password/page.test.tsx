import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ changePassword: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ changePassword: mocks.changePassword }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
import ChangePasswordPage from './page';
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('password mismatch is announced without calling auth', async () => {
  const user = userEvent.setup();
  render(<ChangePasswordPage />);
  await user.type(document.querySelector<HTMLInputElement>('[name="currentPassword"]')!, 'old-password');
  await user.type(document.querySelector<HTMLInputElement>('[name="newPassword"]')!, 'new-password-1');
  await user.type(document.querySelector<HTMLInputElement>('[name="confirmPassword"]')!, 'new-password-2');
  await user.click(screen.getByRole('button', { name: '\u4fee\u6539\u5bc6\u7801' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('\u4e24\u6b21\u8f93\u5165\u7684\u65b0\u5bc6\u7801\u4e0d\u4e00\u81f4');
  expect(mocks.changePassword).not.toHaveBeenCalled();
});

test('password service errors stay visible to assistive technology', async () => {
  mocks.changePassword.mockResolvedValue({ error: new Error('wrong current password') });
  const user = userEvent.setup();
  render(<ChangePasswordPage />);
  await user.type(document.querySelector<HTMLInputElement>('[name="currentPassword"]')!, 'old-password');
  await user.type(document.querySelector<HTMLInputElement>('[name="newPassword"]')!, 'new-password-1');
  await user.type(document.querySelector<HTMLInputElement>('[name="confirmPassword"]')!, 'new-password-1');
  await user.click(screen.getByRole('button', { name: '\u4fee\u6539\u5bc6\u7801' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('\u4fee\u6539\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5f53\u524d\u5bc6\u7801\u548c\u65b0\u5bc6\u7801');
  expect(mocks.changePassword).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'new-password-1', revokeOtherSessions: true });
});
