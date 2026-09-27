'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '../features/classes/actions';

export function ActionForm({ action, label, children, confirm, requestId, successHref }: {
  action: (data: FormData) => Promise<ActionResult>;
  label: string;
  children: ReactNode;
  confirm?: string;
  requestId?: string;
  successHref?: string;
}) {
  const router = useRouter();
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
        if (response.ok) {
          renewRequestId(form);
          form.reset();
          if (successHref) router.push(successHref);
          else router.refresh();
        }
      } catch {
        setResult({ ok: false, message: '操作失败，请重试' });
      }
    });
  }

  return <form onSubmit={submit} onChange={change} className="flex flex-wrap items-end gap-3">
    {requestId && <input type="hidden" name="requestId" defaultValue={requestId} />}
    {children}
    <button type="submit" disabled={pending} className="min-h-10 rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
      {pending ? '处理中…' : label}
    </button>
    {result && <p role={result.ok ? 'status' : 'alert'} className={`w-full text-sm ${result.ok ? 'text-teal-800' : 'text-red-700'}`}>{result.message}</p>}
  </form>;
}
