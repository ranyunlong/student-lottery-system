'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import type { ActionResult } from '../features/classes/actions';
import { Button, type ButtonVariant } from './ui/button';
import { DialogClose } from './ui/dialog';
import { StatusMessage } from './ui/status-message';
import { useDialogActionResult } from './create-dialog';

export function ActionForm({ action, label, children, confirm, requestId, successHref, variant = 'primary', cancelLabel, onResult }: {
  action: (data: FormData) => Promise<ActionResult>;
  label: string;
  children: ReactNode;
  confirm?: string;
  requestId?: string;
  successHref?: string;
  variant?: ButtonVariant;
  cancelLabel?: string;
  onResult?: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const reportDialogResult = useDialogActionResult();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function renewRequestId(form: HTMLFormElement) {
    const field = form.elements.namedItem('requestId');
    if (field instanceof HTMLInputElement) {
      const id = window.crypto.randomUUID();
      field.value = id;
      field.defaultValue = id;
    }
  }

  function change(event: FormEvent<HTMLFormElement>) {
    if (!requestId) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      renewRequestId(event.currentTarget);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await action(data);
        setResult(response);
        onResult?.(response);
        reportDialogResult?.(response);
        if (response.ok) {
          renewRequestId(form);
          form.reset();
          if (successHref) router.push(successHref);
          router.refresh();
        }
      } catch {
        const failure = { ok: false, message: '操作失败，请重试' };
        setResult(failure);
        onResult?.(failure);
        reportDialogResult?.(failure);
      }
    });
  }

  return <form onSubmit={submit} onChange={change} className="flex flex-wrap items-end gap-3">
    {requestId && <input type="hidden" name="requestId" defaultValue={requestId} />}
    {children}
    <div className={cancelLabel ? 'flex w-full flex-wrap justify-end gap-2 border-t border-workspace-line pt-4' : 'admin-action-submit'}>
      {cancelLabel && <DialogClose asChild><Button type="button" variant="secondary" disabled={pending}>{cancelLabel}</Button></DialogClose>}
      <Button type="submit" variant={variant} disabled={pending} icon={pending && !cancelLabel ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : undefined}>
        {pending ? '处理中…' : label}
      </Button>
    </div>
    {result && <StatusMessage role={result.ok ? 'status' : 'alert'} tone={result.ok ? 'success' : 'error'} className="w-full">{result.message}</StatusMessage>}
  </form>;
}
