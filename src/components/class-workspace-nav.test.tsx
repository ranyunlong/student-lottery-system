import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ClassWorkspaceNav } from './class-workspace-nav';

afterEach(cleanup);

test('class workspace links retain paths, labels, and active section', () => {
  render(<ClassWorkspaceNav classId="class-1" active="students" />);
  expect(screen.getByRole('link', { name: '\u56ed\u4e01\u5de5\u4f5c\u533a' })).toHaveAttribute('href', '/teacher');
  expect(screen.getByRole('link', { name: '\u56ed\u4e01\u5de5\u4f5c\u533a' })).toHaveAttribute('href', '/teacher');
  expect(screen.getByRole('link', { name: '\u56ed\u4e01\u5de5\u4f5c\u533a' })).toHaveAttribute('href', '/teacher');
  const navigation = screen.getByRole('navigation', { name: '\u73ed\u7ea7\u5de5\u4f5c\u533a' });
  expect(navigation).toHaveClass('overflow-x-auto', 'flex-row');
  expect(navigation).not.toHaveClass('flex-col');
  expect(screen.getByRole('link', { name: '\u73ed\u7ea7\u6982\u89c8' })).toHaveAttribute('href', '/classes/class-1');
  expect(screen.getByRole('link', { name: '\u5b66\u751f\u540d\u5355' })).toHaveAttribute('href', '/classes/class-1/students');
  expect(screen.getByRole('link', { name: '\u5b66\u751f\u540d\u5355' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '\u5956\u54c1\u4e0e\u5e93\u5b58' })).toHaveAttribute('href', '/classes/class-1/prizes');
  expect(screen.getByRole('link', { name: '\u62bd\u5956\u573a\u6b21' })).toHaveAttribute('href', '/classes/class-1/lotteries');
  expect(screen.getByRole('link', { name: '\u4e2d\u5956\u4e0e\u5151\u6362' })).toHaveAttribute('href', '/classes/class-1/winnings');
});
