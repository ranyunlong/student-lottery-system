import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ArrowRight, Pencil, Plus } from 'lucide-react';
import { ActionForm } from '../../../../../components/action-form';
import { ClassWorkspaceNav } from '../../../../../components/class-workspace-nav';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { EmptyState } from '../../../../../components/ui/empty-state';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../../../../components/ui/table';
import { activateSessionAction, completeSessionAction } from '../../../../../features/lotteries/actions';
import { listSessions } from '../../../../../features/lotteries/sessions';

const labels = { draft: '草稿', active: '进行中', completed: '已完成' };
const tones = { draft: 'neutral', active: 'success', completed: 'accent' } as const;

export default async function LotteriesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [[classRow], sessions] = await Promise.all([
    db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
    listSessions(classId),
  ]);
  return <section className="min-w-0 space-y-5">
    <ClassWorkspaceNav classId={classId} active="lotteries" />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-workspace-ink">{classRow?.name ?? '班级'} · 抽奖场次</h1>
      <Button asChild><Link href={'/classes/' + classId + '/lotteries/new'}><Plus aria-hidden="true" className="size-4" />新建场次</Link></Button>
    </header>
    {sessions.length ? <div className="rounded-md border border-workspace-line bg-white">
      <Table className="min-w-[52rem]">
        <TableCaption className="sr-only">抽奖场次</TableCaption>
        <TableHeader><TableRow><TableHead>场次</TableHead><TableHead>状态</TableHead><TableHead>候选范围</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{sessions.map((item) => {
          const modeLabel = item.mode === 'student-prize' ? '指定学生 · 随机奖品' : '指定奖品 · 随机学生';
          const sessionHref = item.status === 'draft'
            ? `/classes/${classId}/lotteries/new?sessionId=${item.id}&mode=${item.mode}`
            : `/classes/${classId}/lotteries/${item.id}?view=results`;
          return <TableRow key={item.id}>
          <TableCell><span className="sr-only">场次</span><Link href={sessionHref} className="min-w-0 break-words rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent"><span className="block font-semibold">{item.title || modeLabel}</span>{item.title && <span className="block text-sm text-workspace-muted">{modeLabel}</span>}</Link></TableCell>
          <TableCell><span className="sr-only">状态</span><Badge tone={tones[item.status]}>{labels[item.status]}</Badge></TableCell>
          <TableCell><span className="sr-only">候选范围</span><span className="break-words text-sm">候选学生 {item.studentIds.length} 人 · {item.mode === 'student-prize' ? `候选奖品 ${item.prizes.length} 种 · 每人最多 ${item.perStudentLimit} 次` : `抽取 ${item.roundCount} 轮`}</span></TableCell>
          <TableCell><span className="sr-only">操作</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {item.status === 'draft' && <>
                <Button asChild variant="quiet" size="sm"><Link href={`/classes/${classId}/lotteries/new?sessionId=${item.id}&mode=${item.mode}`}><Pencil aria-hidden="true" className="size-4" />编辑配置</Link></Button>
                <ActionForm action={activateSessionAction} label="开始场次"><input type="hidden" name="sessionId" value={item.id} /></ActionForm>
              </>}
              {item.status === 'active' && <>
                <Button asChild variant="quiet" size="sm"><Link href={`/classes/${classId}/lotteries/${item.id}?view=results`}><ArrowRight aria-hidden="true" className="size-4" />查看中奖记录</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href={'/classes/' + classId + '/lotteries/' + item.id}><ArrowRight aria-hidden="true" className="size-4" />进入现场抽奖</Link></Button>
                <ActionForm action={completeSessionAction} label="结束场次" variant="danger" confirm="确定结束这个场次？结束后不能继续抽取。"><input type="hidden" name="sessionId" value={item.id} /></ActionForm>
              </>}
              {item.status === 'completed' && <Button asChild variant="quiet" size="sm"><Link href={`/classes/${classId}/lotteries/${item.id}?view=results`}><ArrowRight aria-hidden="true" className="size-4" />查看中奖记录</Link></Button>}
            </div>
          </TableCell>
        </TableRow>})}</TableBody>
      </Table>
    </div> : <EmptyState title="暂无场次。" />}
  </section>;
}
