import type { FormHTMLAttributes, HTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from './utils';

// Native form semantics are intentional: existing server actions read the same FormData.
export function Form({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn('space-y-4', className)} {...props} />;
}

export function FormLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-workspace-ink', className)} {...props} />;
}

export function FormDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-5 text-workspace-muted', className)} {...props} />;
}

export function FormMessage({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn('text-xs leading-5 text-workspace-danger', className)} {...props} />;
}
