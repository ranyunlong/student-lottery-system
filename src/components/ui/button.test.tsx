import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UsersRound } from 'lucide-react';
import Link from 'next/link';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import { Button } from './button';

afterEach(cleanup);

test('asChild renders a single Link child and merges its classes', () => {
  render(
    <Button asChild className={'button-custom'}>
      <Link className={'link-custom'} href={'/teacher'}>Teacher workspace</Link>
    </Button>,
  );

  const link = screen.getByRole('link', { name: 'Teacher workspace' });
  expect(link).toHaveAttribute('href', '/teacher');
  expect(link).toHaveClass('button-custom', 'link-custom', 'ui-control');
});

test('asChild server-renders a teacher Link containing an icon and label', () => {
  const markup = renderToString(
    <Button asChild variant='quiet' size='sm' className='justify-start'>
      <Link href='/teacher'><UsersRound aria-hidden='true' className='size-4' />Teacher workspace</Link>
    </Button>,
  );

  expect(markup).toContain('href="/teacher"');
  expect(markup).toContain('ui-control');
  expect(markup).toContain('size-4');
  expect(markup).toContain('Teacher workspace');
});

test('disabled asChild prevents the child link click handler from running', () => {
  let clicks = 0;
  render(
    <Button asChild disabled>
      <Link href="/teacher" onClick={() => { clicks += 1; }}>Teacher workspace</Link>
    </Button>,
  );

  const link = screen.getByRole('link', { name: 'Teacher workspace' });
  fireEvent.click(link);

  expect(link).toHaveAttribute('aria-disabled', 'true');
  expect(clicks).toBe(0);
});

test('native button renders its icon before its label', () => {
  render(<Button icon={<UsersRound aria-hidden='true' className='size-4' />}>Continue</Button>);

  const button = screen.getByRole('button', { name: 'Continue' });
  expect(button.querySelector('svg')).toHaveClass('size-4');
  expect(button.firstElementChild).toBe(button.querySelector('svg'));
});

test('supports the redesigned variants and keeps quiet as a compatibility alias', () => {
  render(
    <div>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="quiet">Quiet</Button>
      <Button variant="brand">Brand</Button>
      <Button variant="destructive">Destructive</Button>
    </div>,
  );

  expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quiet' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Brand' })).toHaveClass('bg-workspace-accent');
  expect(screen.getByRole('button', { name: 'Destructive' })).toHaveClass('bg-workspace-danger');
  expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-workspace-accent');
  expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('bg-workspace-danger');
});

test('keeps keyboard focus feedback visible on every button variant', () => {
  render(<Button variant="secondary">Continue</Button>);

  expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass(
    'focus-visible:ring-2',
    'focus-visible:ring-workspace-accent/20',
  );
});

test('loading buttons are disabled and expose an accessible busy state without losing the label', () => {
  const { rerender } = render(<Button loading>Saving</Button>);

  const button = screen.getByRole('button', { name: 'Saving' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  const loader = button.querySelector('svg');
  expect(loader).toHaveAttribute('aria-hidden', 'true');
  expect(loader).toHaveAttribute('width', '16');
  expect(loader).toHaveAttribute('height', '16');

  rerender(<Button>Saving</Button>);
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute('aria-busy');
  expect(button.querySelector('svg')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Saving' })).toBe(button);
});
