'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={500}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({ children, content }: { children: ReactNode; content: ReactNode }) {
  return <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-workspace-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-lg motion-reduce:transition-none">
        {content}
        <TooltipPrimitive.Arrow className="fill-workspace-ink" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
}
