'use client';

import { Minus, Plus } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from './utils';
import { inputClassName } from './input';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'step' | 'inputMode'> & {
  min?: number;
  max?: number;
  step?: number;
  decrementLabel?: string;
  incrementLabel?: string;
};

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

const stepperClassName = 'grid size-11 shrink-0 place-items-center border border-workspace-line bg-workspace-surface text-workspace-muted transition-[background-color,border-color,color] duration-150 hover:border-workspace-accent hover:bg-workspace-accent-soft hover:text-workspace-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput({
  className,
  min,
  max,
  step = 1,
  decrementLabel = '减少数量',
  incrementLabel = '增加数量',
  defaultValue,
  value,
  disabled,
  onChange,
  onKeyDown,
  ...props
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current!);
  const stepValue = Number.isSafeInteger(step) && step > 0 ? step : 1;

  function applyStep(direction: 1 | -1) {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    const current = parseInteger(input.value) ?? 0;
    const next = clamp(current + direction * stepValue, min, max);
    if (next === current) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      applyStep(1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      applyStep(-1);
      return;
    }
    onKeyDown?.(event);
  }

  return <span className="flex w-full min-w-0 items-stretch">
    <button type="button" aria-label={decrementLabel} title={decrementLabel} disabled={disabled}
      onClick={() => applyStep(-1)} className={cn(stepperClassName, 'rounded-l-md rounded-r-none border-r-0')}>
      <Minus aria-hidden="true" className="size-4" />
    </button>
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="-?\d+"
      autoComplete="off"
      className={cn(inputClassName, 'min-w-0 flex-1 rounded-none border-x-0 text-center tabular-nums', className)}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      disabled={disabled}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      {...props}
    />
    <button type="button" aria-label={incrementLabel} title={incrementLabel} disabled={disabled}
      onClick={() => applyStep(1)} className={cn(stepperClassName, 'rounded-r-md rounded-l-none border-l-0')}>
      <Plus aria-hidden="true" className="size-4" />
    </button>
  </span>;
});
