import { Slot } from '@radix-ui/react-slot';
import { LoaderCircle } from 'lucide-react';
import { cloneElement, isValidElement, type ButtonHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'brand' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  icon?: ReactNode;
  loading?: boolean;
};

function preventDisabledClick(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild = false,
  icon,
  loading = false,
  disabled = false,
  children,
  className,
  onClick,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const classNames = cn(
    'ui-control inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill border text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent focus-visible:ring-2 focus-visible:ring-workspace-accent/20',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    'hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none',
    (variant === 'brand' || variant === 'primary') && 'border-workspace-accent bg-workspace-accent bg-linear-to-b from-brand-500 to-brand-600 px-4 text-white shadow-sm hover:brightness-105 hover:shadow',
    variant === 'secondary' && 'border-workspace-line bg-workspace-surface px-4 text-workspace-ink hover:border-workspace-accent hover:bg-workspace-accent-soft',
    variant === 'outline' && 'border-workspace-accent bg-transparent px-4 text-workspace-accent-strong hover:bg-workspace-accent-soft',
    (variant === 'quiet' || variant === 'ghost') && 'border-transparent bg-transparent px-3 text-workspace-muted hover:bg-workspace-surface-alt hover:text-workspace-ink',
    (variant === 'destructive' || variant === 'danger') && 'border-workspace-danger bg-workspace-danger px-4 text-white hover:bg-workspace-danger/90',
    size === 'sm' && 'min-h-10 px-3 text-xs',
    size === 'md' && 'min-h-11',
    size === 'lg' && 'min-h-12 px-5',
    size === 'icon' && 'size-11 px-0',
    className,
  );

  if (asChild) {
    const child = isDisabled && isValidElement(children)
      ? cloneElement(children as ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>, { onClick: preventDisabledClick })
      : children;
    return <Slot
      className={classNames}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onClick}
      {...props}
    >{child}</Slot>;
  }

  return <button className={classNames} disabled={isDisabled} aria-busy={loading || undefined} onClick={onClick} {...props}>
    {loading ? <LoaderCircle size={16} aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : icon}
    {children}
  </button>;
}
