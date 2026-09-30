import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActionForm } from './action-form';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
beforeEach(() => { refresh.mockClear(); push.mockClear(); });
afterEach(cleanup);

test('reports a failed action without refreshing data', async () => {
  render(<ActionForm action={async () => ({ ok: false, message: '邮箱已存在' })} label="保存"><input name="name" /></ActionForm>);
  fireEvent.submit(screen.getByRole('button', { name: '保存' }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('邮箱已存在');
  expect(refresh).not.toHaveBeenCalled();
});

test('reports a successful action and refreshes the list', async () => {
  render(<ActionForm action={async () => ({ ok: true, message: '已创建' })} label="创建"><input name="name" /></ActionForm>);
  fireEvent.submit(screen.getByRole('button', { name: '创建' }).closest('form')!);
  expect(await screen.findByRole('status')).toHaveTextContent('已创建');
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

test('creation returns to the first page and reloads its data', async () => {
  render(<ActionForm action={async () => ({ ok: true, message: '已创建' })} label="创建" successHref="/admin/classes"><input name="name" /></ActionForm>);
  fireEvent.submit(screen.getByRole('button', { name: '创建' }).closest('form')!);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/classes'));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

test('retains request identity for an unchanged retry and renews it when inputs change', async () => {
  const receivedIds: string[] = [];
  const action = vi.fn(async (data: FormData) => {
    receivedIds.push(String(data.get('requestId')));
    return receivedIds.length === 1
      ? { ok: false, message: '稍后重试' }
      : { ok: true, message: '已完成' };
  });
  render(<ActionForm action={action} label="提交" requestId="initial-request-id"><input name="temporaryPassword" defaultValue="First123!" /></ActionForm>);
  const form = screen.getByRole('button', { name: '提交' }).closest('form')!;
  fireEvent.submit(form);
  expect(await screen.findByText('稍后重试')).toHaveAttribute('role', 'alert');
  fireEvent.submit(form);
  expect(await screen.findByText('已完成')).toHaveAttribute('role', 'status');
  expect(receivedIds[1]).toBe('initial-request-id');

  fireEvent.change(form.querySelector<HTMLInputElement>('[name="temporaryPassword"]')!, { target: { value: 'Second456!' } });
  fireEvent.submit(form);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
  expect(receivedIds[2]).not.toBe('initial-request-id');
});
