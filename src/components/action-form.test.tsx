import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ActionForm } from './action-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

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
