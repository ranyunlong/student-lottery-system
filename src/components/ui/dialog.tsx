'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from './utils';

export const Dialog = DialogPrimitive.Root;

export const DialogTrigger = forwardRef<ElementRef<typeof DialogPrimitive.Trigger>, ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>>(function DialogTrigger({ className, ...props }, ref) {
  return <DialogPrimitive.Trigger ref={ref} className={cn('ui-control inline-flex min-h-11 items-center justify-center rounded-pill border border-workspace-accent bg-workspace-accent px-4 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:bg-workspace-accent-strong hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transform-none motion-reduce:transition-none', className)} {...props} />;
});

export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(function DialogOverlay({ className, ...props }, ref) {
  return <DialogPrimitive.Overlay ref={ref} className={cn('ui-dialog-overlay fixed inset-0 z-50 bg-workspace-ink/40', className)} {...props} />;
});

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(function DialogContent({ className, children, ...props }, ref) {
  return <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} className={cn('ui-dialog-content fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-workspace-line bg-workspace-surface p-4 text-workspace-ink shadow-xl focus:outline-none sm:p-6 motion-reduce:transition-none', className)} {...props}>
      {children}
      <DialogPrimitive.Close aria-label="关闭对话框" className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-md text-workspace-muted transition-colors hover:bg-workspace-surface-alt hover:text-workspace-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transition-none">
        <X aria-hidden="true" className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>;
});

export function DialogHeader({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col space-y-2 border-b border-workspace-line pb-4 pr-10 text-left', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold leading-snug text-workspace-ink', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm leading-6 text-workspace-muted', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col-reverse gap-2 border-t border-workspace-line pt-4 sm:flex-row sm:justify-end', className)} {...props} />;
}
