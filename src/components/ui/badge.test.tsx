import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Badge } from './badge';

afterEach(cleanup);

test('info tone renders a readable informational status badge', () => {
  render(<Badge tone="info">Pending review</Badge>);

  expect(screen.getByText('Pending review')).toHaveClass(
    'bg-workspace-info-soft',
    'text-workspace-info-strong',
  );
});
