'use client';

import { useState, type FormEvent } from 'react';
import { createAuthClient } from 'better-auth/react';
import { useRouter } from 'next/navigation';

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

  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5">
    <h1 className="text-2xl font-semibold">修改密码</h1>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">当前密码<input name="currentPassword" type="password" required autoComplete="current-password" className="rounded border p-2" /></label>
      <label className="flex flex-col gap-1">新密码<input name="newPassword" type="password" minLength={8} required autoComplete="new-password" className="rounded border p-2" /></label>
      <label className="flex flex-col gap-1">确认新密码<input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" className="rounded border p-2" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="rounded bg-teal-700 p-2 text-white disabled:opacity-50">{busy ? '提交中…' : '修改密码'}</button>
    </form>
  </main>;
}
