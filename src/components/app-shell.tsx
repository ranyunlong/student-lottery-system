'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { useState, type ReactNode } from 'react';
import { ClipboardList, LayoutDashboard, LogOut, Menu, School, Users } from 'lucide-react';
import { Button } from './ui/button';

const authClient = createAuthClient();

export function AppShell({ role, name, children }: {
  role: 'admin' | 'teacher'; name: string; email: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const links = role === 'admin'
    ? [{ href: '/admin/teachers', label: '老师账号', icon: Users }, { href: '/admin/classes', label: '班级管理', icon: School }, { href: '/admin/audit', label: '审计记录', icon: ClipboardList }]
    : [{ href: '/teacher', label: '园丁工作区', icon: LayoutDashboard }];

  async function signOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return <div data-workspace-role={role} className={`min-h-dvh bg-workspace text-workspace-ink ${role === 'admin' ? 'admin-fair' : ''}`}>
    <header className={`border-b border-workspace-line bg-workspace-surface shadow-[0_1px_2px_rgb(28_25_23_/_0.04)] ${role === 'admin' ? 'admin-fair-header' : ''}`}>
      <div className={`mx-auto flex ${role === 'admin' ? 'max-w-[96rem]' : 'max-w-[80rem]'} flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8`}>
        <Link href="/" className="group flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-workspace-focus">
          <span aria-hidden="true" className={`flex size-10 items-center justify-center rounded-md bg-workspace-accent text-lg font-semibold text-white shadow-sm transition-transform group-hover:-translate-y-px motion-reduce:transition-none ${role === 'admin' ? 'admin-fair-mark' : ''}`}>{role === 'admin' ? '幸' : '抽'}</span>
          <span className="flex flex-col leading-tight"><strong className="text-base font-semibold tracking-tight text-workspace-ink">幸运游园会</strong>
            <span className="mt-1 text-xs text-workspace-muted">{role === 'admin' ? '管理工作台' : '园丁工作区'}</span></span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
          <div className="flex min-w-0 max-w-[34vw] flex-col text-right sm:max-w-52">
            <p className="truncate text-sm font-semibold text-workspace-ink">{name}</p>
            <p className="truncate text-xs text-workspace-muted">{role === 'admin' ? '管理员' : '园丁'}</p>
          </div>
          {role === 'admin' && <Button type="button" variant="quiet" size="icon" className="md:hidden" aria-label="切换导航" aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen((open) => !open)} icon={<Menu aria-hidden="true" className="size-4" />} />}
          <Button type="button" variant="quiet" size="sm" icon={<LogOut aria-hidden="true" className="size-4" />} onClick={signOut} className="min-h-10 text-workspace-muted hover:text-workspace-ink">退出登录</Button>
        </div>
      </div>
    </header>
    <div className={`mx-auto grid w-full min-w-0 ${role === 'admin' ? 'max-w-[96rem]' : 'max-w-[80rem]'} gap-4 px-4 py-4 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 lg:px-8 lg:py-6`}>
      <nav id="workspace-navigation" aria-label="工作区" className={`flex w-full min-w-0 gap-1 overflow-x-auto border-b border-workspace-line pb-2 md:sticky md:top-4 md:self-start md:flex-col md:overflow-visible md:border-0 md:bg-transparent md:pb-0 ${role === 'admin' ? 'admin-fair-nav' : ''} ${role === 'admin' && !navigationOpen ? 'max-md:hidden' : ''}`}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (role === 'teacher' && href === '/teacher' && pathname.startsWith('/classes/'));
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 items-center justify-center rounded-md px-3 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-workspace-focus motion-reduce:transition-none md:w-full md:justify-start md:text-left ${active ? 'bg-workspace-accent-soft text-workspace-accent-strong md:border-l-[3px] md:border-workspace-accent' : 'text-workspace-muted hover:bg-workspace-surface-alt hover:text-workspace-ink'}`}>
            <Icon aria-hidden="true" className="mr-2 size-4" />{label}
          </Link>;
        })}
      </nav>
      <main className="min-w-0 space-y-6">{children}</main>
    </div>
  </div>;
}
