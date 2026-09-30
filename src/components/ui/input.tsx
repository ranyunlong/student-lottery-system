'use client';

import { X } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './utils';

export const inputClassName = 'ui-field min-h-11 w-full min-w-0 rounded-md border border-workspace-line bg-workspace-surface px-3 py-2 text-sm text-workspace-ink outline-2 outline-transparent outline-offset-1 placeholder:text-workspace-muted transition-[background-color,border-color,box-shadow] duration-150 hover:border-workspace-muted hover:bg-workspace-surface-alt focus:border-workspace-accent focus-visible:outline-workspace-accent focus-visible:ring-2 focus-visible:ring-workspace-accent/20 aria-invalid:border-workspace-danger aria-invalid:ring-2 aria-invalid:ring-workspace-danger/15 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { clearable?: boolean; onClear?: () => void; prefixIcon?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, clearable = false, onClear, prefixIcon, onChange, value, defaultValue, type, disabled, ...props }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentValue, setCurrentValue] = useState(String(value ?? defaultValue ?? ''));
  useImperativeHandle(ref, () => inputRef.current!);
  useEffect(() => { if (value !== undefined) setCurrentValue(String(value ?? '')); }, [value]);

  const input = <input ref={inputRef} type={type} value={value} defaultValue={defaultValue} disabled={disabled}
    className={cn(inputClassName, clearable && 'pr-11', clearable && type === 'search' && 'ui-clearable-search', prefixIcon && 'pl-10', className)}
    onChange={(event) => { setCurrentValue(event.currentTarget.value); onChange?.(event); }} {...props} />;
  if ((!clearable && !prefixIcon) || type === 'file' || type === 'hidden') return input;

  function clear() {
    const element = inputRef.current;
    if (!element) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    setCurrentValue('');
    onClear?.();
    element.focus();
  }

  return <span className="relative block min-w-0 w-full">
    {input}
    {prefixIcon && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-workspace-accent-strong [&_svg]:size-4">{prefixIcon}</span>}
    {currentValue && !disabled && <button type="button" aria-label="清空输入内容" title="清空输入内容" onClick={clear}
      className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-workspace-muted transition-colors hover:bg-workspace-accent-soft hover:text-workspace-accent-strong focus-visible:outline-2 focus-visible:outline-workspace-focus motion-reduce:transition-none">
      <X aria-hidden="true" className="size-4" />
    </button>}
  </span>;
});
