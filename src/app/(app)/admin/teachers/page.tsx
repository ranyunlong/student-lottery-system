import { randomUUID } from 'node:crypto';
import { KeyRound, LockKeyhole, Mail, Pencil, Plus, UserRound, UserRoundX } from 'lucide-react';
import { ActionForm } from '../../../../components/action-form';
import { AdminPager } from '../../../../components/admin-pager';
import { AdminTableRow } from '../../../../components/admin-table-row';
import { CreateDialog } from '../../../../components/create-dialog';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardContent } from '../../../../components/ui/card';
import { DialogDescription } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field } from '../../../../components/ui/field';
import { Input } from '../../../../components/ui/input';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { createTeacherAction, disableTeacherAction, resetTeacherPasswordAction, updateTeacherAction } from '../../../../features/classes/actions';
import { listTeachersPage } from '../../../../features/classes/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';
import { TeachersFilters } from './TeachersFilters';

export default async function TeachersPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string; direction?: string }>;
}) {
  await requireAdminPage();
  const { q, status: rawStatus, cursor, direction } = await searchParams;
  const search = (q ?? '').trim().slice(0, 100);
  const status = rawStatus === 'active' || rawStatus === 'disabled' ? rawStatus : 'all';
  const page = await listTeachersPage({ search, status, cursor, direction: direction === 'prev' ? 'prev' : 'next' });
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status !== 'all') params.set('status', status);

  return <section className="min-w-0 space-y-4">
    <header className="admin-page-heading flex flex-wrap items-center justify-between gap-3 border-b border-workspace-line pb-4">
      <div><h1 className="admin-page-title">老师账号</h1><p className="admin-page-subtitle mt-1 text-sm text-workspace-muted">账号列表 · 每页 20 条</p></div>
      <CreateDialog title="创建老师" trigger="创建老师" triggerIcon={<Plus aria-hidden="true" className="size-4" />} successMessage="老师账号已创建">
        <ActionForm action={createTeacherAction} label="确认" requestId={randomUUID()} successHref="/admin/teachers" cancelLabel="取消">
          <Field label="姓名" className="w-full"><Input name="name" autoFocus required clearable prefixIcon={<UserRound aria-hidden="true" className="size-4" />} /></Field>
          <Field label="邮箱" className="w-full"><Input name="email" type="email" required clearable prefixIcon={<Mail aria-hidden="true" className="size-4" />} /></Field>
          <Field label="临时密码" className="w-full"><Input name="temporaryPassword" type="password" minLength={8} autoComplete="new-password" required clearable prefixIcon={<LockKeyhole aria-hidden="true" className="size-4" />} /></Field>
        </ActionForm>
      </CreateDialog>
    </header>
    <section className="space-y-4" aria-label="账号列表">
      <Card className="admin-filter-panel"><CardContent className="p-4 sm:p-5">
        <TeachersFilters key={`${search}:${status}`} search={search} status={status} />
      </CardContent></Card>
      {page.items.length ? <Card className="overflow-hidden">
        <CardContent className="p-0">
        <Table aria-label="老师账号列表" className="table-fixed border-collapse max-[1024px]:block">
          <TableHeader className="bg-workspace text-left max-[1024px]:sr-only"><TableRow>
            <TableHead className="w-1/5 normal-case tracking-normal">姓名</TableHead><TableHead className="w-[32%] normal-case tracking-normal">邮箱</TableHead>
            <TableHead className="w-[13%] normal-case tracking-normal">状态</TableHead><TableHead className="w-1/5 normal-case tracking-normal">创建时间</TableHead>
            <TableHead className="text-right normal-case tracking-normal">操作</TableHead>
          </TableRow></TableHeader>
          <TableBody className="max-[1024px]:block max-[1024px]:w-full">{page.items.map((teacher) => <AdminTableRow key={teacher.id} label={teacher.name} cells={[
            <strong key="name" className="break-words font-medium text-workspace-ink">{teacher.name}</strong>,
            <span key="email" className="break-all">{teacher.email}</span>,
            <Badge key="status" tone={teacher.banned ? 'danger' : 'success'}>{teacher.banned ? '已停用' : '启用中'}</Badge>,
            <time key="date" dateTime={teacher.createdAt.toISOString()} className="text-xs text-workspace-muted">{teacher.createdAt.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>,
          ]} actions={<div className="admin-row-actions [&>button]:border-0">
            <CreateDialog title="编辑老师" trigger="编辑老师" triggerIcon={<Pencil aria-hidden="true" className="size-4" />} iconOnly triggerAriaLabel={`编辑${teacher.name}`} variant="quiet" successMessage="老师账号操作已完成">
              <div className="space-y-5">
                <section className="space-y-3">
                  <h3 className="border-b border-workspace-line pb-2 text-sm font-semibold text-workspace-ink">账号资料</h3>
                  <ActionForm action={updateTeacherAction} label="确认" cancelLabel="取消">
                    <input type="hidden" name="teacherId" value={teacher.id} />
                    <Field label="姓名" className="w-full"><Input name="name" defaultValue={teacher.name} required clearable prefixIcon={<UserRound aria-hidden="true" className="size-4" />} /></Field>
                    <Field label="邮箱" className="w-full"><Input name="email" type="email" defaultValue={teacher.email} required clearable prefixIcon={<Mail aria-hidden="true" className="size-4" />} /></Field>
                  </ActionForm>
                </section>
              </div>
            </CreateDialog>
            <CreateDialog title="修改老师密码" trigger="修改密码" triggerIcon={<KeyRound aria-hidden="true" className="size-4" />} iconOnly triggerAriaLabel={`修改${teacher.name}密码`} variant="quiet" successMessage="老师账号操作已完成">
              <ActionForm action={resetTeacherPasswordAction} label="确认" requestId={randomUUID()} cancelLabel="取消">
                <input type="hidden" name="teacherId" value={teacher.id} />
                <Field label="新临时密码" className="w-full"><Input name="temporaryPassword" type="password" minLength={8} autoComplete="new-password" required clearable prefixIcon={<LockKeyhole aria-hidden="true" className="size-4" />} /></Field>
              </ActionForm>
            </CreateDialog>
            {!teacher.banned && <CreateDialog title="停用老师账号" trigger="停用账号" triggerIcon={<UserRoundX aria-hidden="true" className="size-4" />} iconOnly triggerAriaLabel={`停用${teacher.name}账号`} variant="quiet" successMessage="老师账号操作已完成">
              <div className="space-y-4">
                <DialogDescription>停用后，{teacher.name}将无法登录此账号。</DialogDescription>
                <ActionForm action={disableTeacherAction} label="确认" requestId={randomUUID()} cancelLabel="取消">
                  <input type="hidden" name="teacherId" value={teacher.id} />
                </ActionForm>
              </div>
            </CreateDialog>}
          </div>} />)}</TableBody>
        </Table>
        </CardContent>
      </Card> : <EmptyState title="没有符合条件的老师账号。" description="调整搜索关键词或账号状态后重试。" />}
      <AdminPager basePath="/admin/teachers" params={params} previousCursor={page.previousCursor} nextCursor={page.nextCursor} pageSize={20} />
    </section>
  </section>;
}
