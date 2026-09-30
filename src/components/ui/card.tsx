import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section data-slot="card" className={cn('rounded-md border border-workspace-line bg-workspace-surface text-workspace-ink shadow-soft transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <header data-slot="card-header" className={cn('flex flex-col gap-1.5 border-b border-workspace-line p-4 sm:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 data-slot="card-title" className={cn('text-base font-semibold leading-6 text-workspace-ink', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('p-4 sm:p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <footer data-slot="card-footer" className={cn('flex items-center border-t border-workspace-line p-4 sm:p-5', className)} {...props} />;
}
