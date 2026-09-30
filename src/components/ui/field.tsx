import { Children, cloneElement, isValidElement, useId, type LabelHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cn } from './utils';

type ControlProps = {
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-errormessage'?: string;
  'aria-invalid'?: boolean | 'false' | 'true';
};

type FieldProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, 'required'> & {
  label: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function Field({ label, description, hint, error, required = false, children, className, htmlFor, ...props }: FieldProps) {
  const generatedId = useId();
  const helper = description ?? hint;
  let controlIndex = -1;
  let existingControlId: string | undefined;
  Children.forEach(children, (child, index) => {
    if (controlIndex === -1 && isValidElement<ControlProps>(child) && typeof child.props.id === 'string') {
      controlIndex = index;
      existingControlId = child.props.id;
    }
  });
  if (controlIndex === -1) {
    Children.forEach(children, (child, index) => {
      if (controlIndex === -1 && isValidElement<ControlProps>(child)) controlIndex = index;
    });
  }
  const controlId = existingControlId ?? htmlFor ?? generatedId;
  const descriptionId = controlId && helper ? `${controlId}-description` : undefined;
  const errorId = controlId && error ? `${controlId}-error` : undefined;

  const enhancedChildren = controlId
    ? Children.map(children, (child, index) => {
      if (!isValidElement<ControlProps>(child) || index !== controlIndex) return child;
      const describedBy = [child.props['aria-describedby'], descriptionId, errorId].filter(Boolean).join(' ') || undefined;
      return cloneElement(child as ReactElement<ControlProps>, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-errormessage': errorId,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        required: required || child.props.required,
      });
    })
    : children;

  return <div className={cn('min-w-0', className)}>
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-workspace-ink" htmlFor={controlId} {...props}>
      <span>{label}{required && <span aria-hidden="true" className="ml-1 text-workspace-danger">*</span>}</span>
      {enhancedChildren}
    </label>
    {helper && <span id={descriptionId} className="mt-1 block text-xs font-normal text-workspace-muted">{helper}</span>}
    {error && <span id={errorId} className="mt-1 block text-xs font-normal text-workspace-danger">{error}</span>}
  </div>;
}

