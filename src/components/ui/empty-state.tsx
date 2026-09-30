import type { ReactNode } from 'react';
import { cn } from './utils';

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={cn('border-y border-workspace-line bg-workspace-surface px-6 py-12 text-center', className)}>
    {icon && <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-workspace-accent-soft text-workspace-accent-strong">{icon}</div>}
    <p className="font-semibold text-workspace-ink">{title}</p>
    {description && <p className="mx-auto mt-1 max-w-md text-sm text-workspace-muted">{description}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>;
}
