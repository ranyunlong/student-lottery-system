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
  const quantity = screen.getByRole('textbox', { name: '本场数量 彩笔' });
  expect(quantity).toHaveValue('2');
  expect(quantity).toHaveAttribute('inputMode', 'numeric');
  await user.click(screen.getByRole('button', { name: '添加 画册' }));
  expect(screen.getByDisplayValue('p1')).toHaveAttribute('name', 'prizeIds');
  expect(within(screen.getByTestId('selected-prizes')).getByText('画册')).toBeVisible();
  expect(screen.getByRole('textbox', { name: '本场数量 画册' })).toHaveValue('3');
});

test('prize transfer box only offers in-stock prizes and separates stock from the name', () => {
  render(<PrizeTransferBox items={[
    { id: 'p1', name: '画册', stock: 3 },
    { id: 'p2', name: '铅笔', stock: 0 },
  ]} />);

  expect(screen.queryByRole('button', { name: '添加 铅笔' })).not.toBeInTheDocument();
  const row = screen.getByRole('button', { name: '添加 画册' });
  const name = within(row).getByText('画册');
  const stock = within(row).getByText('库存 3');
  const arrow = row.querySelector('svg');
  expect(arrow).not.toBeNull();
  if (!arrow) throw new Error('Expected transfer row arrow icon');
  expect(name.contains(stock)).toBe(false);
  expect(name.compareDocumentPosition(stock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(stock.compareDocumentPosition(arrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('selected prizes show stock and step quantity between one and full stock', async () => {
  const user = userEvent.setup();
  render(<PrizeTransferBox items={[{ id: 'p1', name: '画册', stock: 3 }]} />);
  await user.click(screen.getByRole('button', { name: '添加 画册' }));
  expect(within(screen.getByTestId('selected-prizes')).getByText('库存 3')).toBeVisible();
  const quantity = screen.getByRole('textbox', { name: '本场数量 画册' });
  expect(quantity).toHaveValue('3');

  await user.click(screen.getByRole('button', { name: '减少本场数量 画册' }));
  expect(quantity).toHaveValue('2');
  await user.click(screen.getByRole('button', { name: '减少本场数量 画册' }));
  await user.click(screen.getByRole('button', { name: '减少本场数量 画册' }));
  expect(quantity).toHaveValue('1');
  await user.click(screen.getByRole('button', { name: '增加本场数量 画册' }));
  await user.click(screen.getByRole('button', { name: '增加本场数量 画册' }));
  await user.click(screen.getByRole('button', { name: '增加本场数量 画册' }));
  expect(quantity).toHaveValue('3');
});

test('selected prize quantity cannot be entered above its stock', async () => {
  const user = userEvent.setup();
  render(<PrizeTransferBox items={[{ id: 'p1', name: '画册', stock: 3 }]} initialQuantities={{ p1: 2 }} />);
  const quantity = screen.getByRole('textbox', { name: '本场数量 画册' });
  await user.clear(quantity);
  await user.type(quantity, '4');
  expect(quantity).toHaveValue('3');
});

test('a draft quantity is clamped to the prize stock currently available', () => {
  render(<PrizeTransferBox items={[{ id: 'p1', name: '画册', stock: 3 }]} initialQuantities={{ p1: 5 }} />);

  const quantity = screen.getByRole('textbox', { name: '本场数量 画册' });
  expect(quantity).toHaveValue('3');
});

test('single prize availability is described in draw rounds rather than student count', () => {
  render(<PrizeTransferBox single items={[{ id: 'p1', name: '画册', stock: 6 }]} />);
  expect(screen.getByRole('button', { name: '添加 画册' })).toHaveTextContent('最多抽取 6 轮');
});
