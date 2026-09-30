import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export function StatusMessage({ tone, children, className, ...props }: HTMLAttributes<HTMLDivElement> & {
  tone: 'success' | 'error' | 'warning' | 'info';
  children: ReactNode;
}) {
  return <div className={cn(
    'flex items-start gap-2 rounded-sm border border-l-4 px-3 py-3 text-sm leading-5',
    tone === 'success' && 'border-workspace-success/20 bg-workspace-success-soft text-workspace-success',
    tone === 'error' && 'border-workspace-danger/20 bg-workspace-danger-soft text-workspace-danger',
    tone === 'warning' && 'border-workspace-warm/30 bg-workspace-warm-soft text-amber-900',
    tone === 'info' && 'border-workspace-accent/20 bg-workspace-accent-soft text-workspace-accent-strong',
    className,
  )} {...props}>{children}</div>;
}
