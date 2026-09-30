import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

afterEach(cleanup);

test('renders an accessible Radix dialog with semantic sections and a labeled close control', () => {
  render(
    <Dialog>
      <DialogTrigger>Open settings</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Update your preferences.</DialogDescription>
        </DialogHeader>
        <p>Content</p>
        <DialogFooter>Save</DialogFooter>
      </DialogContent>
    </Dialog>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveClass('ui-dialog-content');
  expect(dialog).toHaveAttribute('data-state', 'open');
  expect(dialog).toHaveTextContent('Update your preferences');
  expect(document.body.querySelector('.ui-dialog-overlay')).toHaveAttribute('data-state', 'open');
  expect(within(dialog).getByRole('button', { name: '关闭对话框' })).toBeInTheDocument();
  expect(within(dialog).getByText('Save')).toBeInTheDocument();
});


