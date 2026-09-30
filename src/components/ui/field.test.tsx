import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { Field } from './field';

afterEach(cleanup);

test.each([undefined, 'email'])('associates a labeled control with description and error text (htmlFor: %s)', (htmlFor) => {
  render(
    <Field label="Email" htmlFor={htmlFor} description="Use your school email" error="Email is required" required>
      <input id="email" />
    </Field>,
  );

  const control = screen.getByRole('textbox', { name: 'Email' });
  const description = screen.getByText('Use your school email');
  const error = screen.getByText('Email is required');

  expect(screen.getByText('Email').closest('label')).toHaveAttribute('for', 'email');
  expect(control).toHaveAttribute('required');
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby', `${description.id} ${error.id}`);
  expect(control).toHaveAttribute('aria-errormessage', error.id);
});

test('uses the existing control id for label and helper associations when htmlFor conflicts', async () => {
  const user = userEvent.setup();
  render(
    <Field label="Email" htmlFor="a" description="Use your school email" error="Email is required" required>
      <input id="b" />
    </Field>,
  );

  const control = screen.getByRole('textbox', { name: 'Email' });
  const labelText = screen.getByText('Email');
  expect(control).toHaveAttribute('id', 'b');
  expect(labelText.closest('label')).toHaveAttribute('for', 'b');
  expect(labelText.closest('label')?.control).toBe(control);
  expect(screen.getByText('Use your school email')).toHaveAttribute('id', 'b-description');
  expect(screen.getByText('Email is required')).toHaveAttribute('id', 'b-error');
  expect(control).toHaveAttribute('aria-describedby', 'b-description b-error');
  expect(control).toHaveAttribute('aria-errormessage', 'b-error');
  expect(control).toHaveAccessibleDescription('Use your school email Email is required');
  expect(control).toHaveAccessibleErrorMessage('Email is required');
  expect(control).toBeRequired();

  await user.click(labelText);
  expect(control).toHaveFocus();
});

test('keeps hint as a compatible alias for description', () => {
  render(
    <Field label="Name" hint="Shown publicly">
      <input id="name" />
    </Field>,
  );

  expect(screen.getByText('Shown publicly')).toBeInTheDocument();
});

test('generates a control id and associates helper, error, and required state without a caller id', () => {
  render(
    <Field label="Email" hint="Use your school email" error="Email is required" required>
      <input />
    </Field>,
  );

  const control = screen.getByRole('textbox', { name: 'Email' });
  const label = screen.getByText('Email').closest('label');
  const hint = screen.getByText('Use your school email');
  const error = screen.getByText('Email is required');

  expect(control).toHaveAttribute('id');
  expect(label).toHaveAttribute('for', control.id);
  expect(control).toHaveAttribute('required');
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby', `${hint.id} ${error.id}`);
  expect(control).toHaveAttribute('aria-errormessage', error.id);
});
