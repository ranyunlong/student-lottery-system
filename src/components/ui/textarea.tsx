import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './utils';
import { inputClassName } from './input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputClassName, 'min-h-28 resize-y', className)} {...props} />;
});
