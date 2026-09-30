import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

afterEach(cleanup);

test('renders semantic table parts without hiding table content', () => {
  render(
    <Table>
      <TableCaption>Students</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Ada</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total: 1</TableCell>
        </TableRow>
      </TableFooter>
    </Table>,
  );

  const table = screen.getByRole('table', { name: 'Students' });
  expect(table).toBeInTheDocument();
  expect(table.parentElement).toHaveClass('overflow-x-auto');
  expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveClass('bg-workspace-surface-alt/70', 'text-workspace-ink');
  expect(screen.getByRole('cell', { name: 'Ada' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Total: 1' })).toBeInTheDocument();
});
