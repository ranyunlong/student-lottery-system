import Image from 'next/image';
import Link from 'next/link';
import { Archive, Pencil, Plus, School, Users } from 'lucide-react';
import { ActionForm } from '../../../../components/action-form';
import { AdminPager } from '../../../../components/admin-pager';
import { AdminTableRow } from '../../../../components/admin-table-row';
import { CreateDialog } from '../../../../components/create-dialog';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardContent } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { archiveClassAction, createClassAction } from '../../../../features/classes/actions';
import { listClassesPage } from '../../../../features/classes/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';
import { ClassEditForm } from './ClassEditForm';
import { ClassesFilters } from './ClassesFilters';

export default async function ClassesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string; direction?: string; notice?: string }>;
}) {
  await requireAdminPage();
  const { q, status: rawStatus, cursor, direction, notice } = await searchParams;
  const search = (q ?? '').trim().slice(0, 100);
  const status = rawStatus === 'active' || rawStatus === 'archived' ? rawStatus : 'all';
  const page = await listClassesPage({ search, status, cursor, direction: direction === 'prev' ? 'prev' : 'next' });
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status !== 'all') params.set('status', status);
  const archiveSuccessParams = new URLSearchParams(params);
  archiveSuccessParams.set('notice', 'archived');
  const archiveSuccessHref = `/admin/classes?${archiveSuccessParams}`;

  return <section className="min-w-0 space-y-4">
    <header className="admin-page-heading flex flex-wrap items-center justify-between gap-3 border-b border-workspace-line pb-4">
      <div><h1 className="admin-page-title text-xl font-semibold tracking-tight text-workspace-ink">班级管理</h1><p className="admin-page-subtitle mt-1 text-sm text-workspace-muted">班级列表 · 每页 20 条</p></div>
      <CreateDialog title="创建班级" trigger="创建班级" triggerIcon={<Plus aria-hidden="true" className="size-4" />} successMessage="班级已创建">
        <ActionForm action={createClassAction} label="确认" cancelLabel="取消" successHref="/admin/classes">
          <Field label="班级名称" className="w-full"><Input name="name" prefixIcon={<School aria-hidden="true" className="size-4" />} clearable autoFocus required /></Field>
        </ActionForm>
      </CreateDialog>
    </header>
    <section className="space-y-4" aria-label="班级列表">
      <Card className="admin-filter-panel"><CardContent className="p-4 sm:p-5">
        <ClassesFilters key={`${search}:${status}`} search={search} status={status} />
      </CardContent></Card>
      {notice === 'archived' && <p role="status" className="border-y border-workspace-success/20 bg-workspace-success-soft py-3 text-sm font-medium text-workspace-success">班级已归档。</p>}
      {page.items.length ? <Card className="overflow-hidden">
        <CardContent className="p-0">
        <Table aria-label="班级列表" className="table-fixed border-collapse max-[1024px]:block">
          <TableHeader className="bg-workspace text-left max-[1024px]:sr-only"><TableRow>
            <TableHead className="w-[26%] normal-case tracking-normal">班级</TableHead><TableHead className="w-[25%] normal-case tracking-normal">老师配置</TableHead>
            <TableHead className="w-[14%] normal-case tracking-normal">状态</TableHead><TableHead className="w-[17%] normal-case tracking-normal">创建时间</TableHead>
            <TableHead className="w-36 text-right normal-case tracking-normal">操作</TableHead>
          </TableRow></TableHeader>
          <TableBody className="max-[1024px]:block max-[1024px]:w-full">{page.items.map((item) => <AdminTableRow key={item.id} label={item.name} fieldLabels={['班级', '老师配置', '状态', '创建时间']} cells={[
            <span key="name" className="flex min-w-0 items-center gap-3 font-medium text-workspace-ink">
              {item.emblemPath ? <Image unoptimized width={36} height={36} alt={`${item.name}班徽`}
                src={`/api/classes/${item.id}/emblem?v=${encodeURIComponent(item.emblemPath)}`}
                className="h-9 w-9 shrink-0 rounded border border-workspace-line bg-workspace-surface object-contain" />
                : <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-workspace-accent-soft text-sm font-semibold text-workspace-accent-strong">班</span>}
              <span className="min-w-0 break-words">{item.name}</span>
            </span>,
            <div key="members" className="min-w-0 space-y-1 break-words">
              {item.members.some((member) => member.role === 'primary') ? <p><span className="text-workspace-muted">班主任</span>　{item.members.filter((member) => member.role === 'primary').map((member) => member.name).join('、')}</p>
                : <p className="text-workspace-muted">未设置班主任</p>}
              <p><span className="text-workspace-muted">任课</span>　{item.members.filter((member) => member.role === 'teaching').map((member) => member.name).join('、') || '未分配'}</p>
            </div>,
            <Badge key="status" tone={item.archived ? 'neutral' : 'success'}>{item.archived ? '已归档' : '使用中'}</Badge>,
            <time key="date" dateTime={item.createdAt.toISOString()} className="text-xs text-workspace-muted">{item.createdAt.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>,
          ]} actions={<div className="admin-row-actions flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
            <Link aria-label={`查看${item.name}学生名单`} title={`查看${item.name}学生名单`} href={`/classes/${item.id}/students`}
              className="admin-row-action inline-flex size-10 shrink-0 items-center justify-center rounded-md text-workspace-accent-strong hover:bg-workspace-accent-soft focus-visible:outline-2 focus-visible:outline-workspace-accent">
              <Users aria-hidden="true" className="size-4" /></Link>
            {!item.archived && <CreateDialog title={`编辑班级：${item.name}`} trigger="编辑" triggerIcon={<Pencil aria-hidden="true" className="size-4" />}
              iconOnly triggerAriaLabel={`编辑班级${item.name}`} successMessage="班级操作已完成" variant="quiet" size="wide">
              <div data-class-editor-scroll className="max-h-[calc(100dvh-12rem)] space-y-6 overflow-y-auto overscroll-contain px-3">
                <ClassEditForm classId={item.id} name={item.name} emblemPath={item.emblemPath} members={item.members} />
              </div>
            </CreateDialog>}
            {!item.archived && <CreateDialog title={`归档班级：${item.name}`} trigger="归档班级"
              triggerIcon={<Archive aria-hidden="true" className="size-4" />} iconOnly
              triggerAriaLabel={`归档班级${item.name}`} successMessage="班级已归档" variant="quiet">
              <div className="space-y-4">
                <p className="text-sm leading-6 text-workspace-muted">归档后班级资料和老师分配将不可再编辑。确认后班级将从使用中列表移除。</p>
                <ActionForm action={archiveClassAction} label="确认" cancelLabel="取消" successHref={archiveSuccessHref}>
                  <input type="hidden" name="classId" value={item.id} />
                </ActionForm>
              </div>
            </CreateDialog>}
          </div>} />)}</TableBody>
        </Table>
        </CardContent>
      </Card> : <EmptyState title="没有符合条件的班级。" description="调整搜索关键词或班级状态后重试。" />}
      <AdminPager basePath="/admin/classes" params={params} previousCursor={page.previousCursor} nextCursor={page.nextCursor} pageSize={20} />
    </section>
  </section>;
}
