import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { Gift, ReceiptText, School, Ticket, UsersRound } from 'lucide-react';
import { db } from '../../../../db/client';
import { classes } from '../../../../db/schema';
import { listStudents } from '../../../../features/students/service';
import { listPrizes } from '../../../../features/prizes/service';
import { listSessions } from '../../../../features/lotteries/sessions';
import { listWinnings } from '../../../../features/redemptions/service';
import { requireClassAccess } from '../../../../lib/access';
import { ClassWorkspaceNav } from '../../../../components/class-workspace-nav';
import { Button } from '../../../../components/ui/button';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Badge } from '../../../../components/ui/badge';
import { ClassEmblem } from '../../teacher/class-emblem';

export default async function ClassHomePage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireClassAccess(classId);
  const [[classRow], students, prizes, sessions, winnings] = await Promise.all([
    db.select({ name: classes.name, archived: classes.archived, emblemPath: classes.emblemPath }).from(classes).where(and(eq(classes.id, classId), eq(classes.archived, false))).limit(1),
    listStudents(classId), listPrizes(classId), listSessions(classId), listWinnings(classId),
  ]);
  if (!classRow) return <EmptyState icon={<School aria-hidden="true" className="size-5" />} title="班级不存在或已归档。" />;
  const activeSessions = sessions.filter((item) => item.status === 'active').length;
  const stock = prizes.filter((item) => !item.archived).reduce((sum, item) => sum + item.stock, 0);
  return <section className="min-w-0 space-y-6">
    <ClassWorkspaceNav classId={classId} active="overview" />
    <header className="flex min-w-0 flex-wrap items-center gap-4 border-b border-workspace-line pb-5">
      <ClassEmblem classId={classId} name={classRow.name} emblemPath={classRow.emblemPath} size="overview" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold text-workspace-accent-strong">班级概览</p>
        <h1 className="break-words text-xl font-semibold text-workspace-ink">{classRow.name}</h1>
      </div>
      <Badge tone="success">使用中</Badge>
    </header>
    <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="min-w-0 rounded-md border border-workspace-info/20 bg-workspace-info-soft px-4 py-3 shadow-sm"><dt className="flex items-center gap-2 text-sm font-medium text-workspace-info-strong"><UsersRound aria-hidden="true" className="size-4 shrink-0" />学生</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-workspace-ink">{students.filter((item) => !item.archived).length}</dd></div>
      <div className="min-w-0 rounded-md border border-workspace-warm/30 bg-workspace-warm-soft px-4 py-3 shadow-sm"><dt className="flex items-center gap-2 text-sm font-medium text-amber-900"><Gift aria-hidden="true" className="size-4 shrink-0" />可用库存</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-workspace-ink">{stock}</dd></div>
      <div className="min-w-0 rounded-md border border-workspace-accent/20 bg-workspace-accent-soft px-4 py-3 shadow-sm"><dt className="flex items-center gap-2 text-sm font-medium text-workspace-accent-strong"><Ticket aria-hidden="true" className="size-4 shrink-0" />进行中场次</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-workspace-ink">{activeSessions}</dd></div>
      <div className="min-w-0 rounded-md border border-workspace-success/20 bg-workspace-success-soft px-4 py-3 shadow-sm"><dt className="flex items-center gap-2 text-sm font-medium text-workspace-success"><ReceiptText aria-hidden="true" className="size-4 shrink-0" />中奖记录</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-workspace-ink">{winnings.length}</dd></div>
    </dl>
    <section aria-labelledby="class-actions-heading" className="space-y-3">
      <h2 id="class-actions-heading" className="border-l-4 border-workspace-warm pl-3 text-sm font-semibold text-workspace-ink">班级工作区</h2>
      <div className="flex min-w-0 flex-wrap gap-2 rounded-md border border-workspace-line bg-workspace-surface px-3 py-3 shadow-sm">
        <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + classId + '/students'}><UsersRound aria-hidden="true" className="size-4" />学生名单</Link></Button>
        <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + classId + '/prizes'}><Gift aria-hidden="true" className="size-4" />奖品与库存</Link></Button>
        <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + classId + '/lotteries'}><Ticket aria-hidden="true" className="size-4" />抽奖场次</Link></Button>
        <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + classId + '/winnings'}><ReceiptText aria-hidden="true" className="size-4" />中奖与兑换</Link></Button>
      </div>
    </section>
  </section>;
}
