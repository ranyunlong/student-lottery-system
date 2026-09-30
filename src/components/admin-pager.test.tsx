import { render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { cleanup } from '@testing-library/react';
import { AdminPager } from './admin-pager';

afterEach(cleanup);

test('pager keeps filters and uses separate directions for older and newer records', () => {
  render(<AdminPager basePath="/admin/classes" params={new URLSearchParams({ q: '三', status: 'archived' })}
    previousCursor="newer-id" nextCursor="older-id" pageSize={20} />);
  expect(screen.getByRole('link', { name: '上一页' })).toHaveAttribute('href',
    '/admin/classes?q=%E4%B8%89&status=archived&cursor=newer-id&direction=prev');
  expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href',
    '/admin/classes?q=%E4%B8%89&status=archived&cursor=older-id&direction=next');
  expect(screen.getByText('每页 20 条')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '上一页' })).toHaveClass('ui-control', 'border-workspace-accent', 'bg-transparent');
});

test('pager renders unavailable directions without links', () => {
  render(<AdminPager basePath="/admin/teachers" params={new URLSearchParams()} previousCursor={null} nextCursor={null} pageSize={20} />);
  expect(screen.queryByRole('link', { name: '上一页' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '下一页' })).not.toBeInTheDocument();
});
