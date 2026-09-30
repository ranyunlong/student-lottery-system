import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ClassWorkspaceNav } from '../../../../../components/class-workspace-nav';
import { Badge } from '../../../../../components/ui/badge';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { listWinnings } from '../../../../../features/redemptions/service';
import { requireClassAccess } from '../../../../../lib/access';
import { WinningsRecords } from './winnings-records';

export default async function WinningsPage({ params, searchParams }: {
  params: Promise<{ classId: string }>; searchParams: Promise<{ status?: string; studentId?: string | string[] }>;
}) {
  const { classId } = await params;
  const { status, studentId } = await searchParams;
  await requireClassAccess(classId);
  const selected = status === 'redeemed' ? 'redeemed' : 'pending';
  const [pending, redeemed, [target]] = await Promise.all([
    listWinnings(classId, 'pending'), listWinnings(classId, 'redeemed'),
    db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
  ]);
  const exactStudentId = typeof studentId === 'string' && /^\d+$/.test(studentId) ? Number(studentId) : null;
  const items = selected === 'pending'
    ? pending.filter((win) => exactStudentId === null || win.studentId === exactStudentId)
    : redeemed;
  return <section className="min-w-0 space-y-5">
    <ClassWorkspaceNav classId={classId} active="winnings" />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 break-words text-xl font-semibold text-workspace-ink">{target?.name} · 中奖历史</h1>
      <Badge tone={selected === 'pending' ? 'warning' : 'success'}>{selected === 'pending' ? '待兑' : '已兑'}</Badge>
    </header>
    <nav aria-label="兑换状态" className="flex gap-1 border-b border-workspace-line text-sm font-medium">
      <Link aria-current={selected === 'pending' ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 ${selected === 'pending' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:border-workspace-line hover:text-workspace-ink'}`}
        href={'/classes/' + classId + '/winnings'}>待兑（{pending.length}）</Link>
      <Link aria-current={selected === 'redeemed' ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 ${selected === 'redeemed' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:border-workspace-line hover:text-workspace-ink'}`}
        href={'/classes/' + classId + '/winnings?status=redeemed'}>已兑（{redeemed.length}）</Link>
    </nav>
    {selected === 'pending' && exactStudentId !== null && <div className="flex flex-wrap items-center justify-between gap-2 border-y border-workspace-line bg-workspace-accent-soft px-4 py-3 text-sm text-workspace-accent-strong">
      <span className="font-medium">仅显示该学生的待兑换记录</span>
      <Link className="inline-flex min-h-10 items-center font-semibold underline underline-offset-4 hover:text-workspace-ink" href={`/classes/${classId}/winnings`}>查看全部待兑</Link>
    </div>}
    <WinningsRecords classId={classId} items={items} selected={selected} />
  </section>;
}
