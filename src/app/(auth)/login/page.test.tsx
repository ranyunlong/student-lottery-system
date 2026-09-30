import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signInEmail: vi.fn() }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ signIn: { email: mocks.signInEmail } }) }));
import LoginPage from './page';
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('login announces errors and shows pending state while auth is unresolved', async () => {
  let resolveSignIn!: (value: { error?: unknown }) => void;
  mocks.signInEmail.mockReturnValue(new Promise((resolve) => { resolveSignIn = resolve; }));
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(document.querySelector<HTMLInputElement>('[name="email"]')!, 'teacher@example.com');
  await user.type(document.querySelector<HTMLInputElement>('[name="password"]')!, 'secret123');
  await user.click(screen.getByRole('button', { name: '\u767b\u5f55' }));
  expect(screen.getByRole('button', { name: '\u767b\u5f55\u4e2d\u2026' })).toBeDisabled();
  resolveSignIn({ error: new Error('bad credentials') });
  expect(await screen.findByRole('alert')).toHaveTextContent('\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\uff0c\u6216\u8d26\u53f7\u5df2\u505c\u7528');
  await waitFor(() => expect(screen.getByRole('button', { name: '\u767b\u5f55' })).toBeEnabled());
});

test('login centers the form over a decorative canvas without extra copy', () => {
  render(<LoginPage />);
  expect(screen.getByRole('heading', { name: '幸运游园会' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveClass('grid', 'place-items-center');
  expect(screen.getByRole('main').querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('form', { name: '账号登录' }).closest('.relative')).not.toBeNull();
  expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
  expect(screen.getByLabelText('密码')).toBeInTheDocument();
  expect(screen.getByLabelText('邮箱')).toHaveClass('login-field');
  expect(screen.getByLabelText('密码')).toHaveClass('login-field');
  expect(screen.queryByText('校园活动工作台')).not.toBeInTheDocument();
  expect(screen.queryByText('使用已开通的管理员或教师账号')).not.toBeInTheDocument();
});

test('the card mascot tracks pointer direction and resets when pointer leaves', async () => {
  const user = userEvent.setup();
  render(<LoginPage />);
  const mascot = screen.getByTestId('login-mascot');
  expect(mascot).toHaveAttribute('aria-hidden', 'true');
  await user.pointer({ target: screen.getByRole('main'), coords: { x: 500, y: 200 } });
  expect(mascot.style.getPropertyValue('--look-x')).not.toBe('0px');
  await user.unhover(screen.getByRole('main'));
  expect(mascot.style.getPropertyValue('--look-x')).toBe('0px');
});

test('login fields can be cleared and password visibility toggled', async () => {
  const user = userEvent.setup();
  render(<LoginPage />);
  const email = screen.getByLabelText('邮箱');
  const password = screen.getByLabelText('密码');
  await user.type(email, 'teacher@example.com');
  await user.type(password, 'secret123');
  await user.click(screen.getByRole('button', { name: '显示密码' }));
  expect(password).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: '隐藏密码' }));
  expect(password).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: '清空邮箱' }));
  expect(email).toHaveValue('');
  await user.click(screen.getByRole('button', { name: '清空密码' }));
  expect(password).toHaveValue('');
});

test('login footer credits Mininglamp without replacing the sign-in form', () => {
  render(<LoginPage />);
  expect(screen.getByRole('link', { name: 'Mininglamp' })).toHaveAttribute('href', 'https://www.mininglamp.com/');
  expect(screen.getByText(/© 2026 幸运游园会 Designed by/)).toBeVisible();
});
