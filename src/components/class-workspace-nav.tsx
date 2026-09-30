import Link from 'next/link';
import { ArrowLeft, Gift, LayoutDashboard, ReceiptText, Ticket, UsersRound } from 'lucide-react';
import { cn } from './ui/utils';

type ClassWorkspaceSection = 'overview' | 'students' | 'prizes' | 'lotteries' | 'winnings';

const sections = [
  { key: 'overview', label: '班级概览', icon: LayoutDashboard, suffix: '' },
  { key: 'students', label: '学生名单', icon: UsersRound, suffix: '/students' },
  { key: 'prizes', label: '奖品与库存', icon: Gift, suffix: '/prizes' },
  { key: 'lotteries', label: '抽奖场次', icon: Ticket, suffix: '/lotteries' },
  { key: 'winnings', label: '中奖与兑换', icon: ReceiptText, suffix: '/winnings' },
] as const;

export function ClassWorkspaceNav({ classId, active }: { classId: string; active: ClassWorkspaceSection }) {
  const basePath = `/classes/${classId}`;

  return <div className="min-w-0 space-y-3">
    <Link href="/teacher" className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-workspace-muted transition-colors hover:bg-workspace-surface-alt hover:text-workspace-ink focus-visible:outline-2 focus-visible:outline-workspace-accent motion-reduce:transition-none">
      <ArrowLeft aria-hidden="true" className="size-4" />
      园丁工作区
    </Link>
    <nav aria-label="班级工作区" className="flex w-full min-w-0 max-w-full flex-row gap-1 overflow-x-auto border-b border-workspace-line pb-2">
      {sections.map(({ key, label, icon: Icon, suffix }) => <Link
        key={key}
        href={basePath + suffix}
        aria-current={active === key ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-workspace-accent',
          active === key
            ? 'bg-workspace-accent-soft text-workspace-accent-strong md:bg-workspace-surface md:ring-1 md:ring-workspace-line'
            : 'text-workspace-muted hover:bg-workspace-surface-alt hover:text-workspace-ink',
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </Link>)}
    </nav>
  </div>;
}
