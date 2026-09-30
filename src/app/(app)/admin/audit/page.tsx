import Link from 'next/link';
import { Search } from 'lucide-react';
import { ActionForm } from '../../../../components/action-form';
import { AdminPager } from '../../../../components/admin-pager';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { listAuditActorNames } from '../../../../features/classes/audit-actors';
import { listAdminAuditPage } from '../../../../features/classes/service';
import { correctRedemptionAction } from '../../../../features/redemptions/actions';
import { shanghaiAuditDay } from '../../../../features/redemptions/audit-filters';
import { findRedeemedWinForCorrection, listRedemptionAudit } from '../../../../features/redemptions/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';

const date = (value: Date) => value.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const auditTableClass = 'table-fixed border-collapse max-[1024px]:block';
const auditTableHeaderClass = 'bg-workspace text-left max-[1024px]:sr-only';
const auditTableBodyClass = 'max-[1024px]:block max-[1024px]:w-full';
const auditRowClass = 'bg-workspace-surface align-middle max-[1024px]:block max-[1024px]:w-full';
const auditCellClass = 'grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2 px-4 py-3 text-sm text-workspace-ink max-[1024px]:py-2 min-[1025px]:table-cell min-[1025px]:align-middle';
const auditLabelClass = 'font-medium text-workspace-muted max-[1024px]:block min-[1025px]:hidden';
const actionLabels: Record<string, string> = {
  'teacher.create': '创建老师', 'teacher.update': '修改老师', 'teacher.disable': '停用老师',
  'teacher.password.reset': '重置密码', 'class.create': '创建班级', 'class.update': '修改班级',
  'class.archive': '归档班级', 'class.teacher.assign': '分配老师', 'class.teacher.remove': '移除老师',
  'class.teacher.primary.set': '设置主负责老师',
};

export default async function AuditPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string; direction?: string; winId?: string; view?: string; date?: string; keyword?: string }>;
}) {
  await requireAdminPage();
  const { cursor, direction, winId, view: rawView, date: rawDate, keyword: rawKeyword } = await searchParams;
  const view = rawView === 'management' ? 'management' : 'redemptions';
  const pagingDirection = direction === 'prev' ? 'prev' : 'next';
  const selectedDate = rawDate?.trim() ?? '';
  const keyword = rawKeyword?.trim().slice(0, 100) ?? '';
  const invalidDate = Boolean(selectedDate && !shanghaiAuditDay(selectedDate));
  const params = new URLSearchParams({ view });
  if (view === 'redemptions' && winId) params.set('winId', winId);
  if (view === 'redemptions' && selectedDate) params.set('date', selectedDate);
  if (view === 'redemptions' && keyword) params.set('keyword', keyword);
  const tabs = <nav aria-label="审计类型" className="flex w-full min-w-0 flex-wrap gap-x-4 border-b border-workspace-line">
    <Link href="/admin/audit?view=redemptions" aria-current={view === 'redemptions' ? 'page' : undefined}
      className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transition-none ${view === 'redemptions' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:text-workspace-ink'}`}>兑换与纠错</Link>
    <Link href="/admin/audit?view=management" aria-current={view === 'management' ? 'page' : undefined}
      className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transition-none ${view === 'management' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:text-workspace-ink'}`}>管理操作</Link>
  </nav>;

  if (view === 'management') {
    const page = await listAdminAuditPage({ cursor, direction: pagingDirection });
    const actorNames = await listAuditActorNames(page.items.map((event) => event.actorId));
    return <section className="min-w-0 space-y-5">
      <header className="admin-page-heading flex flex-wrap items-center justify-between gap-3 border-b border-workspace-line pb-4"><div><h1 className="admin-page-title">审计记录</h1><p className="admin-page-subtitle mt-1 text-sm text-workspace-muted">管理操作 · 每页 25 条</p></div></header>
      {tabs}
      {page.items.length ? <Card className="overflow-hidden"><CardContent className="p-0"><Table aria-label="管理操作记录" className={auditTableClass}>
        <TableHeader className={auditTableHeaderClass}><TableRow>
          <TableHead className="w-44 bg-workspace normal-case tracking-normal">时间</TableHead><TableHead className="bg-workspace normal-case tracking-normal">操作</TableHead>
          <TableHead className="w-28 bg-workspace normal-case tracking-normal">状态</TableHead><TableHead className="w-40 bg-workspace normal-case tracking-normal">操作人</TableHead>
        </TableRow></TableHeader>
        <TableBody className={auditTableBodyClass}>
          {page.items.map((event) => {
            const state = (event.details as { state?: string } | null)?.state;
            const stateLabel = state === 'pending' ? '处理中' : state === 'needs_reconciliation' ? '需核查' : '完成';
            return <TableRow key={event.id} className={auditRowClass}>
              <TableCell className={`${auditCellClass} break-words tabular-nums text-workspace-muted`}>
                <span aria-hidden="true" className={auditLabelClass}>时间</span>
                <span className="min-w-0"><time dateTime={event.createdAt.toISOString()}>{date(event.createdAt)}</time></span>
              </TableCell>
              <TableCell className={`${auditCellClass} break-words font-medium`}>
                <span aria-hidden="true" className={auditLabelClass}>操作</span>
                <span className="min-w-0">{actionLabels[event.action] ?? event.action}</span>
              </TableCell>
              <TableCell className={auditCellClass}>
                <span aria-hidden="true" className={auditLabelClass}>状态</span>
                <span className="min-w-0"><Badge tone={state === 'pending' ? 'warning' : state === 'needs_reconciliation' ? 'danger' : 'neutral'}>{stateLabel}</Badge></span>
              </TableCell>
              <TableCell className={`${auditCellClass} break-words text-workspace-muted`}>
                <span aria-hidden="true" className={auditLabelClass}>操作人</span><span className="min-w-0">{actorNames.get(event.actorId) ?? '未知账号'}</span>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table></CardContent></Card> : <EmptyState title="暂无管理操作。" description="管理操作会在这里按时间倒序显示。" />}
      <AdminPager basePath="/admin/audit" params={params} previousCursor={page.previousCursor} nextCursor={page.nextCursor} pageSize={25} />
    </section>;
  }

  const lookup = winId ? findRedeemedWinForCorrection(winId)
    .then((located) => ({ located, lookupError: false }))
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === '中奖记录编号无效') {
        return { located: null, lookupError: true };
      }
      throw error;
    }) : Promise.resolve({ located: null, lookupError: false });
  const [page, { located, lookupError }] = await Promise.all([
    listRedemptionAudit(cursor, pagingDirection, { date: selectedDate, keyword }),
    lookup,
  ]);
  return <section className="min-w-0 space-y-5">
    <header className="admin-page-heading flex flex-wrap items-center justify-between gap-3 border-b border-workspace-line pb-4"><div><h1 className="admin-page-title">审计记录</h1><p className="admin-page-subtitle mt-1 text-sm text-workspace-muted">兑换与纠错 · 每页 25 条</p></div></header>
    {tabs}
    <section className="space-y-4">
      <Card className="admin-filter-panel"><CardContent className="p-4 sm:p-5"><form method="get" action="/admin/audit" className="admin-filter-form flex flex-wrap items-end gap-3 text-sm sm:gap-4">
        <input type="hidden" name="view" value="redemptions" />
        {winId && <input type="hidden" name="winId" value={winId} />}
        <Field label="日期" className="min-w-[10rem] flex-1">
          <Input type="date" name="date" defaultValue={selectedDate} aria-invalid={invalidDate} />
        </Field>
        <Field label="学生学号或姓名" className="min-w-[12rem] flex-[2]">
          <Input clearable name="keyword" defaultValue={keyword} maxLength={100} placeholder="输入学生学号或姓名" />
        </Field>
        <Button type="submit" variant="brand"><Search aria-hidden="true" className="size-4" />查找</Button>
      </form></CardContent></Card>
      {invalidDate && <p role="alert" className="text-sm text-workspace-danger">日期格式无效</p>}
      {winId && (lookupError ? <p role="alert" className="text-sm text-workspace-danger">中奖记录编号无效</p>
        : located ? <Card className="max-w-2xl"><CardContent className="space-y-3 text-sm">
        <p className="break-words font-semibold">{located.studentNumberSnapshot} · {located.studentNameSnapshot} · {located.prizeNameSnapshot}</p>
        <p className="text-workspace-muted">当前已兑 · <time dateTime={located.redeemedAt?.toISOString()}>{located.redeemedAt && date(located.redeemedAt)}</time></p>
        <ActionForm action={correctRedemptionAction} label="纠正误标" confirm="确定将这条记录恢复为待兑？" variant="brand">
          <input type="hidden" name="winId" value={located.id} />
          <Field label="纠错原因"><Input clearable name="reason" required maxLength={500} /></Field>
        </ActionForm>
      </CardContent></Card> : <p className="text-sm text-workspace-muted">未找到当前已兑的中奖记录。</p>)}
      {page.events.length ? <Card className="overflow-hidden"><CardContent className="p-0"><Table aria-label="兑换与纠错记录" className={auditTableClass}>
        <TableHeader className={auditTableHeaderClass}><TableRow>
          <TableHead className="w-40 bg-workspace normal-case tracking-normal">时间</TableHead><TableHead className="w-44 bg-workspace normal-case tracking-normal">学生 / 奖品</TableHead>
          <TableHead className="w-24 bg-workspace normal-case tracking-normal">状态变更</TableHead><TableHead className="w-28 bg-workspace normal-case tracking-normal">操作人</TableHead>
          <TableHead className="bg-workspace normal-case tracking-normal">纠错原因</TableHead><TableHead className="w-48 bg-workspace normal-case tracking-normal">中奖记录</TableHead>
        </TableRow></TableHeader>
        <TableBody className={auditTableBodyClass}>
          {page.events.map((event) => <TableRow key={event.id} className={auditRowClass}>
            <TableCell className={`${auditCellClass} break-words tabular-nums text-workspace-muted`}>
              <span aria-hidden="true" className={auditLabelClass}>时间</span>
              <span className="min-w-0"><time dateTime={event.createdAt.toISOString()}>{date(event.createdAt)}</time></span>
            </TableCell>
            <TableCell className={`${auditCellClass} break-words font-medium`}>
              <span aria-hidden="true" className={auditLabelClass}>学生 / 奖品</span>
              <span className="min-w-0">{event.studentNumberSnapshot} · {event.studentNameSnapshot} · {event.prizeNameSnapshot}</span>
            </TableCell>
            <TableCell className={auditCellClass}>
              <span aria-hidden="true" className={auditLabelClass}>状态变更</span>
              <span className="min-w-0">{event.previousStatus === 'pending' ? '待兑' : '已兑'} → {event.newStatus === 'pending' ? '待兑' : '已兑'}</span>
            </TableCell>
            <TableCell className={`${auditCellClass} break-words text-workspace-muted`}>
              <span aria-hidden="true" className={auditLabelClass}>操作人</span><span className="min-w-0">{event.actorName}</span>
            </TableCell>
            <TableCell className={`${auditCellClass} break-words [overflow-wrap:anywhere]`}>
              <span aria-hidden="true" className={auditLabelClass}>纠错原因</span><span className="min-w-0">{event.reason || '—'}</span>
            </TableCell>
            <TableCell className={`${auditCellClass} break-all text-workspace-muted`}>
              <span aria-hidden="true" className={auditLabelClass}>中奖记录</span>
              <span className="min-w-0 flex flex-wrap gap-x-3 gap-y-1">
                <Link className="inline-flex min-h-9 items-center rounded-sm font-medium text-workspace-accent-strong underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transition-none" href={'/classes/' + event.classId + '/winnings'}>查看记录</Link>
                {event.currentStatus === 'redeemed'
                  ? <Link className="inline-flex min-h-9 items-center rounded-sm font-medium text-workspace-accent-strong underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-accent motion-reduce:transition-none" href={'/admin/audit?view=redemptions&winId=' + encodeURIComponent(event.winningRecordId)}>定位纠错</Link>
                  : <span>当前待兑</span>}
              </span>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table></CardContent></Card> : <EmptyState title="暂无兑换记录。" description="兑换和纠错事件会在这里按时间倒序显示。" />}
      <AdminPager basePath="/admin/audit" params={params} previousCursor={page.previousCursor ?? null} nextCursor={page.nextCursor} pageSize={25} />
    </section>
  </section>;
}
