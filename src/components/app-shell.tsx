'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import type { ReactNode } from 'react';

const authClient = createAuthClient();

export function AppShell({ role, children }: { role: 'admin' | 'teacher'; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = role === 'admin'
    ? [{ href: '/admin/teachers', label: '老师账号' }, { href: '/admin/classes', label: '班级管理' }, { href: '/admin/audit', label: '审计记录' }]
    : [{ href: '/classes', label: '老师工作区' }];

  async function signOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900">学生抽奖系统</Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{role === 'admin' ? '管理员' : '老师'}</span>
          <button type="button" onClick={signOut} className="text-teal-800 hover:underline">退出登录</button>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label="工作区" className="flex gap-1 md:flex-col">
        {links.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href || (href === '/classes' && pathname.startsWith('/classes/')) ? 'page' : undefined}
          className={`rounded px-3 py-2 text-sm font-medium ${(pathname === href || (href === '/classes' && pathname.startsWith('/classes/'))) ? 'bg-teal-100 text-teal-900' : 'text-slate-600 hover:bg-slate-200'}`}>
          {label}
        </Link>)}
      </nav>
      <main className="min-w-0 space-y-6">{children}</main>
    </div>
  </div>;
}
