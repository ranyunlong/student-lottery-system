import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Card, CardContent } from './card';

afterEach(cleanup);

test('card frames a functional surface with a soft elevation', () => {
  render(<Card aria-label="筛选"><CardContent>内容</CardContent></Card>);
  expect(screen.getByRole('region', { name: '筛选' })).toHaveClass('shadow-soft', 'rounded-md');
  expect(screen.getByText('内容')).toHaveClass('p-4');
});
