import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { PrizeTransferBox, StudentTransferBox } from './lottery-transfer-box';

afterEach(cleanup);

test('selected students have visible separation between rows', () => {
  render(<StudentTransferBox items={[{ id: 1, label: 'S001' }, { id: 2, label: 'S002' }]} initialSelectedIds={[1, 2]} />);
  expect(screen.getByRole('region', { name: '已选学生' }).querySelector('[data-testid="selected-students"]')).toHaveClass('space-y-2');
});

test('student transfer box searches and moves students while preserving hidden form values', async () => {
  const user = userEvent.setup();
  render(<StudentTransferBox items={[
    { id: 1, label: 'S001 · 林同学' },
    { id: 2, label: 'S002 · 王同学' },
  ]} initialSelectedIds={[2]} />);

  expect(screen.getByDisplayValue('2')).toHaveAttribute('name', 'studentIds');
  await user.type(screen.getByRole('searchbox', { name: '搜索学生' }), '林');
  expect(screen.getByText('S001 · 林同学')).toBeVisible();
  expect(screen.queryByRole('button', { name: '添加 S002 · 王同学' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '添加 S001 · 林同学' }));
  expect(document.querySelector('input[name="studentIds"][value="1"]')).toBeInTheDocument();
  expect(document.querySelector('input[name="studentIds"][value="2"]')).toBeInTheDocument();
});

test('prize transfer box keeps quantity inputs only for selected prizes', async () => {
  const user = userEvent.setup();
  render(<PrizeTransferBox items={[
    { id: 'p1', name: '画册', stock: 3 },
    { id: 'p2', name: '彩笔', stock: 4 },
  ]} initialQuantities={{ p2: 2 }} />);

  expect(screen.getByDisplayValue('p2')).toHaveAttribute('name', 'prizeIds');
  const quantity = screen.getByRole('spinbutton', { name: '本场数量 彩笔' });
  expect(quantity).toHaveValue(2);
  expect(quantity).toHaveClass('h-8', 'min-h-8');
  expect(quantity.closest('label')).toHaveClass('flex', 'items-center');
  await user.click(screen.getByRole('button', { name: '添加 画册' }));
  expect(screen.getByDisplayValue('p1')).toHaveAttribute('name', 'prizeIds');
  expect(within(screen.getByTestId('selected-prizes')).getByText('画册')).toBeVisible();
});

test('selected prize quantity cannot be entered above its stock', async () => {
  const user = userEvent.setup();
  render(<PrizeTransferBox items={[{ id: 'p1', name: '画册', stock: 3 }]} initialQuantities={{ p1: 2 }} />);
  const quantity = screen.getByRole('spinbutton', { name: '本场数量 画册' });
  await user.clear(quantity);
  await user.type(quantity, '4');
  expect(quantity).toHaveValue(3);
});

test('single prize availability is described in draw rounds rather than student count', () => {
  render(<PrizeTransferBox single items={[{ id: 'p1', name: '画册', stock: 6 }]} />);
  expect(screen.getByRole('button', { name: '添加 画册' })).toHaveTextContent('最多抽取 6 轮');
});

