import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'info';
}) {
  return <span className={cn(
    'inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
    tone === 'neutral' && 'border-workspace-line bg-workspace-surface-alt text-workspace-muted',
    tone === 'success' && 'border-workspace-success/20 bg-workspace-success-soft text-workspace-success',
    tone === 'warning' && 'border-workspace-warm/30 bg-workspace-warm-soft text-amber-900',
    tone === 'danger' && 'border-workspace-danger/20 bg-workspace-danger-soft text-workspace-danger',
    tone === 'accent' && 'border-workspace-accent/20 bg-workspace-accent-soft text-workspace-accent-strong',
    tone === 'info' && 'border-workspace-info/25 bg-workspace-info-soft text-workspace-info-strong',
    className,
  )} {...props} />;
}
