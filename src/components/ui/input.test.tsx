import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { Mail } from 'lucide-react';
import { Input } from './input';
import { Select } from './select';
import { Textarea } from './textarea';

afterEach(cleanup);
beforeAll(() => { HTMLElement.prototype.scrollIntoView ??= () => {}; });

test('shares visible focus, invalid, and reduced-motion states across form controls', () => {
  render(
    <div>
      <Input aria-label="Search" />
      <Select aria-label="Status" aria-invalid="true"><option>Active</option></Select>
      <Textarea aria-label="Notes" />
    </div>,
  );

  for (const control of [screen.getByRole('textbox', { name: 'Search' }), screen.getByRole('combobox', { name: 'Status' }), screen.getByRole('textbox', { name: 'Notes' })]) {
    expect(control).toHaveClass('focus-visible:ring-2', 'motion-reduce:transition-none');
  }
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveClass('aria-invalid:ring-2', 'aria-invalid:ring-workspace-danger/15');
});

test('clearable input clears submitted value and keeps focus', () => {
  render(<form aria-label="Filter"><Input clearable aria-label="Search" name="q" defaultValue="park" /></form>);
  const input = screen.getByRole('textbox', { name: 'Search' });
  fireEvent.click(screen.getByRole('button', { name: '清空输入内容' }));
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
  expect(new FormData(screen.getByRole('form', { name: 'Filter' }) as HTMLFormElement).get('q')).toBe('');
});

test('custom select submits selected option without a visible native select', () => {
  render(<form aria-label="Filter"><Select aria-label="Status" name="status" defaultValue="all">
    <option value="all">All</option><option value="active">Active</option>
  </Select></form>);
  const select = screen.getByRole('combobox', { name: 'Status' });
  expect(select.tagName).toBe('BUTTON');
  expect(new FormData(screen.getByRole('form', { name: 'Filter' }) as HTMLFormElement).get('status')).toBe('all');
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  expect(select).toHaveAttribute('aria-expanded', 'true');
});

test('clearing a controlled search resets its dependent status', () => {
  function Filters() {
    const [query, setQuery] = useState('Lin');
    const [status, setStatus] = useState('active');
    return <form aria-label="Filters"><Input aria-label="Query" clearable name="q" value={query}
      onChange={(event) => setQuery(event.currentTarget.value)} onClear={() => setStatus('all')} />
      <output>{status}</output></form>;
  }
  render(<Filters />);
  fireEvent.click(screen.getByRole('button', { name: '清空输入内容' }));
  expect(screen.getByRole('textbox', { name: 'Query' })).toHaveValue('');
  expect(screen.getByText('all')).toBeInTheDocument();
});

test('input can render a decorative leading icon alongside its clear action', () => {
  render(<Input aria-label="Email" prefixIcon={<Mail data-testid="email-icon" />} clearable defaultValue="a@b.com" />);
  const input = screen.getByRole('textbox', { name: 'Email' });
  expect(input).toHaveClass('pl-10');
  expect(screen.getByTestId('email-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: '清空输入内容' })).toBeInTheDocument();
});

test('clearable search suppresses the native clear control', () => {
  render(<Input type="search" aria-label="Search" clearable defaultValue="park" />);
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveClass('ui-clearable-search');
  expect(screen.getAllByRole('button', { name: '清空输入内容' })).toHaveLength(1);
});

test('custom select chooses an option and updates form data', async () => {
  const user = userEvent.setup();
  render(<form aria-label="Filters"><Select aria-label="Status" name="status" defaultValue="all">
    <option value="all">All</option><option value="active">Active</option>
  </Select></form>);
  screen.getByRole('combobox', { name: 'Status' }).focus();
  await user.keyboard('{ArrowDown}');
  await user.keyboard('a{Enter}');
  expect(new FormData(screen.getByRole('form', { name: 'Filters' }) as HTMLFormElement).get('status')).toBe('active');
});
