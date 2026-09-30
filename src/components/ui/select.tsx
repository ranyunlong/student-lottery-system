'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Children, forwardRef, isValidElement, type ChangeEvent, type OptionHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './utils';
import { inputClassName } from './input';

type SelectProps = Pick<SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'name' | 'value' | 'defaultValue' | 'onChange' | 'required' | 'disabled' | 'className' | 'title' |
  'aria-label' | 'aria-describedby' | 'aria-errormessage' | 'aria-invalid' | 'aria-busy'> & { children: ReactNode };

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select({ className, children, value, defaultValue, onChange, name, required, disabled, id, ...props }, ref) {
  const options = Children.toArray(children).filter(isValidElement<OptionHTMLAttributes<HTMLOptionElement>>)
    .filter((child) => child.type === 'option')
    .map((child) => ({ value: String(child.props.value ?? child.props.children ?? ''), label: child.props.children, disabled: child.props.disabled }));
  const placeholder = options.find((option) => option.value === '')?.label;

  function change(nextValue: string) {
    onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
  }

  return <SelectPrimitive.Root name={name} value={value === undefined ? undefined : String(value)}
    defaultValue={defaultValue === undefined ? undefined : String(defaultValue)} required={required} disabled={disabled} onValueChange={change}>
    <SelectPrimitive.Trigger ref={ref} id={id} className={cn(inputClassName, 'flex cursor-pointer items-center justify-between gap-2 text-left', className)} {...props}>
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-workspace-accent-strong" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={5} className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-workspace-line bg-workspace-surface p-1 text-workspace-ink shadow-xl">
        <SelectPrimitive.Viewport className="max-h-64 overflow-y-auto">
          {options.filter((option) => option.value !== '').map((option) => <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled}
            className="ui-select-option relative flex min-h-10 cursor-pointer select-none items-center rounded-sm py-2 pl-9 pr-3 text-sm outline-none data-[highlighted]:bg-workspace-accent-soft data-[highlighted]:text-workspace-accent-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
            <SelectPrimitive.ItemIndicator className="absolute left-2"><Check aria-hidden="true" className="size-4" /></SelectPrimitive.ItemIndicator>
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
});
