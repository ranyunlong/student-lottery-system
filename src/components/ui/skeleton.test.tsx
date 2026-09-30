import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Skeleton } from './skeleton';

afterEach(cleanup);

test('renders a reusable reduced-motion-safe loading surface', () => {
  render(<Skeleton aria-label="Loading students" />);

  const skeleton = screen.getByRole('status', { name: 'Loading students' });
  expect(skeleton).toHaveClass('motion-safe:animate-pulse', 'motion-reduce:animate-none');
});
