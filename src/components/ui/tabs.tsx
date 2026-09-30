'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from './utils';

export function Tabs({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('min-w-0', className)} {...props} />;
}

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex min-w-0 gap-1 overflow-x-auto border-b border-workspace-line', className)} {...props} />;
}

export function TabsTrigger({ className, children, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { children: ReactNode }) {
  return <TabsPrimitive.Trigger className={cn(
    'inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-semibold text-workspace-muted transition-colors',
    'hover:text-workspace-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent data-[state=active]:border-workspace-accent data-[state=active]:bg-workspace-accent-soft/60 data-[state=active]:text-workspace-ink motion-reduce:transition-none',
    className,
  )} {...props}>{children}</TabsPrimitive.Trigger>;
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5 outline-none data-[state=active]:animate-fade-in motion-reduce:animate-none', className)} {...props} />;
}
