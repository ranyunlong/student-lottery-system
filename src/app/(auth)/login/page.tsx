'use client';

import { useState, type FormEvent } from 'react';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient();

export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
    setBusy(false);
    if (result.error) { setError('邮箱或密码错误，或账号已停用'); return; }
    const signedInUser = result.data?.user as typeof result.data.user & { mustChangePassword?: boolean };
    window.location.assign(signedInUser?.mustChangePassword ? '/change-password' : '/');
  }

  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5">
    <h1 className="text-2xl font-semibold">登录学生抽奖系统</h1>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">邮箱<input name="email" type="email" required autoComplete="username" className="rounded border p-2" /></label>
      <label className="flex flex-col gap-1">密码<input name="password" type="password" required autoComplete="current-password" className="rounded border p-2" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="rounded bg-teal-700 p-2 text-white disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
    </form>
  </main>;
}
