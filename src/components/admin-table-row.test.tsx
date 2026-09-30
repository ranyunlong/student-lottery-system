import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AdminTableRow } from './admin-table-row';

test('renders one full-width summary row with four data cells and direct actions', () => {
  render(<table><tbody><AdminTableRow
    cells={['李老师', 'wang@example.test', '正常', '2026-09-27']}
    actions={<button type="button">编辑</button>}
    label="李老师"
  /></tbody></table>);

  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveClass('max-[1024px]:w-full');
  expect(rows[0]).toHaveTextContent('姓名');
  expect(rows[0]).toHaveTextContent('邮箱');
  expect(rows[0]).toHaveTextContent('状态');
  expect(rows[0]).toHaveTextContent('创建时间');
  expect(rows[0].querySelectorAll('td')).toHaveLength(5);
  expect(screen.getByRole('button', { name: '编辑' }).closest('td')).toBe(rows[0].querySelectorAll('td')[4]);
  expect(screen.queryByRole('button', { name: /管理李老师/ })).not.toBeInTheDocument();
});
