'use client';

import { useState, type FormEvent } from 'react';
import { createAuthClient } from 'better-auth/react';
import { useRouter } from 'next/navigation';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { StatusMessage } from '../../../components/ui/status-message';

const authClient = createAuthClient();

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('newPassword'));
    if (password !== form.get('confirmPassword')) { setError('两次输入的新密码不一致'); return; }
    setBusy(true);
    setError('');
    const result = await authClient.changePassword({
      currentPassword: String(form.get('currentPassword')),
      newPassword: password,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (result.error) { setError('修改失败，请检查当前密码和新密码'); return; }
    router.push('/');
    router.refresh();
  }

  return <main className="grid min-h-dvh place-items-center bg-workspace px-4 py-8 sm:px-6">
    <section className="w-full max-w-sm rounded-md border border-workspace-line bg-workspace-surface p-6">
      <div className="mb-6 flex items-center gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-md bg-workspace-accent-soft text-workspace-accent-strong"><KeyRound className="size-5" /></span>
        <h1 className="text-xl font-semibold text-workspace-ink">修改密码</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="当前密码"><Input name="currentPassword" type="password" required autoComplete="current-password" /></Field>
        <Field label="新密码" hint="至少 8 位字符"><Input name="newPassword" type="password" minLength={8} required autoComplete="new-password" /></Field>
        <Field label="确认新密码"><Input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" /></Field>
        {error && <StatusMessage role="alert" tone="error" className="rounded-md">{error}</StatusMessage>}
        <Button type="submit" disabled={busy} className="mt-2 w-full" icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : undefined}>{busy ? '提交中…' : '修改密码'}</Button>
      </form>
    </section>
  </main>;
}
