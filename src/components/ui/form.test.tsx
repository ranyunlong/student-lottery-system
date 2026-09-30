import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Form, FormDescription, FormLabel } from './form';

afterEach(cleanup);

test('form wrappers keep native field names and label association', () => {
  render(<Form><FormLabel htmlFor="name">姓名</FormLabel><input id="name" name="name" />
    <FormDescription id="name-help">用于展示</FormDescription></Form>);
  expect(screen.getByRole('textbox', { name: '姓名' })).toHaveAttribute('name', 'name');
  expect(screen.getByText('用于展示')).toHaveClass('text-workspace-muted');
});
