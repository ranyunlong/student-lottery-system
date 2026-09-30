import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role={props['aria-label'] ? 'status' : undefined} className={cn('min-h-4 rounded-sm bg-workspace-surface-alt motion-safe:animate-pulse motion-reduce:animate-none', className)} {...props} />;
}
