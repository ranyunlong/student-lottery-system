import type { HTMLAttributes } from 'react';
import { cn } from './utils';

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
};

export function Separator({ className, orientation = 'horizontal', decorative = false, ...props }: SeparatorProps) {
  return <div
    role={decorative ? 'none' : 'separator'}
    aria-orientation={decorative ? undefined : orientation}
    aria-hidden={decorative ? true : undefined}
    className={cn(
      'shrink-0 bg-workspace-line',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />;
}
