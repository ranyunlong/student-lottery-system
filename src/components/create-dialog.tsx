'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import type { ActionResult } from '../features/classes/actions';

const DialogActionContext = createContext<((result: ActionResult) => void) | null>(null);
export function useDialogActionResult() { return useContext(DialogActionContext); }

export function CreateDialog({ title, trigger, triggerAriaLabel, triggerIcon, iconOnly = false, successMessage, variant = 'primary', size = 'default', children }: {
  title: string; trigger: string; successMessage?: string; children: ReactNode;
  triggerAriaLabel?: string; triggerIcon?: ReactNode; iconOnly?: boolean; variant?: 'primary' | 'quiet'; size?: 'default' | 'wide';
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger aria-label={triggerAriaLabel ?? (iconOnly ? trigger : undefined)} title={iconOnly ? triggerAriaLabel ?? trigger : undefined}
        className={`${variant === 'quiet' ? 'border-workspace-line bg-workspace-surface text-workspace-ink hover:border-workspace-accent hover:bg-workspace-accent-soft' : 'shadow-soft hover:-translate-y-px motion-reduce:transform-none'} ${iconOnly ? 'admin-row-action size-10 min-h-10 rounded-md p-0' : 'gap-2'}`}
        onClick={() => setNotice(false)}>{triggerIcon}{!iconOnly && trigger}</DialogTrigger>
      {notice && <p role="status" className="fixed bottom-4 right-4 top-auto z-50 max-w-[calc(100vw-2rem)] rounded-md border border-workspace-success/20 bg-workspace-success-soft px-4 py-3 text-sm font-medium text-workspace-success shadow-lg sm:bottom-auto sm:top-20">
        {successMessage ?? title + '已完成'}
      </p>}
      <DialogContent className={size === 'wide' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="min-w-0">{open && <DialogActionContext.Provider value={(result) => {
          if (result.ok) { setNotice(true); setOpen(false); }
        }}>{children}</DialogActionContext.Provider>}</div>
      </DialogContent>
    </Dialog>
  </>;
}
