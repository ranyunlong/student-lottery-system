import { render, screen } from '@testing-library/react';
import Page from './page';
import { expect, test } from 'vitest';

test('显示班级工作入口', () => {
  render(<Page />);
  expect(screen.getByRole('heading', { name: '班级' })).toBeInTheDocument();
});
