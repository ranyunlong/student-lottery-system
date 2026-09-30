import Link from 'next/link';
import { ArrowRight, Gift, ReceiptText, Search, Ticket, UsersRound } from 'lucide-react';
import { listTeacherClasses } from '../../../features/classes/service';
import { requireTeacherPage } from '../../../lib/workspace-guard';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Input } from '../../../components/ui/input';
import { Field } from '../../../components/ui/field';
import { Card, CardContent } from '../../../components/ui/card';
import { ClassEmblem } from './class-emblem';
import { withTeacherClassEmblems } from './teacher-classes';

export default async function TeacherPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireTeacherPage();
  const classes = await withTeacherClassEmblems(await listTeacherClasses());
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const filteredClasses = search
    ? classes.filter((item) => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    : classes;
  return <section className="teacher-workspace min-w-0 space-y-6">
    <header className="teacher-page-heading flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold text-workspace-accent-strong">园丁工作区</p>
        <h1 className="break-words text-xl font-semibold text-workspace-ink">我的班级</h1>
      </div>
      <Badge tone="accent">{filteredClasses.length} 个班级</Badge>
    </header>
    <Card className="admin-filter-panel">
      <CardContent className="p-4 sm:p-5">
        <form action="/teacher" method="get" role="search" className="admin-filter-form flex flex-wrap items-end gap-3 text-sm sm:gap-4">
          <Field label="搜索班级名称" className="min-w-0 flex-1 sm:min-w-[18rem]">
            <Input id="teacher-class-search" type="search" name="q" maxLength={100} defaultValue={search} placeholder="输入班级名称搜索" />
          </Field>
          <Button type="submit" variant="brand"><Search aria-hidden="true" className="size-4" />搜索</Button>
          {search && <Button asChild type="button" variant="quiet" size="sm"><Link href="/teacher">清除搜索</Link></Button>}
        </form>
      </CardContent>
    </Card>
    {classes.length === 0 ? <EmptyState icon={<UsersRound aria-hidden="true" className="size-5" />} title="尚未分配班级，请联系管理员。" />
      : filteredClasses.length === 0 ? <EmptyState icon={<UsersRound aria-hidden="true" className="size-5" />} title="没有符合条件的班级。" />
      : <Card className="teacher-class-list overflow-hidden">
      <CardContent className="p-0">
      <Table className="teacher-class-table min-w-full">
        <TableCaption className="sr-only">我的班级</TableCaption>
        <TableHeader className="max-[1024px]:sr-only">
          <TableRow><TableHead>班级</TableHead><TableHead>常用入口</TableHead><TableHead>主要操作</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {filteredClasses.map((item) => <TableRow key={item.id} className="max-[1024px]:block max-[1024px]:border-b max-[1024px]:px-4 max-[1024px]:py-3 min-[1025px]:bg-white">
            <TableCell className="min-w-0 max-[1024px]:grid max-[1024px]:grid-cols-[3.5rem_minmax(0,1fr)] max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-3 min-[1025px]:w-[20%]">
              <span className="font-medium text-workspace-muted min-[1025px]:hidden">班级</span>
              <span className="flex min-w-0 items-center gap-3">
                <ClassEmblem classId={item.id} name={item.name} emblemPath={item.emblemPath} />
                <span className="min-w-0 break-words font-semibold text-workspace-ink">{item.name}</span>
              </span>
            </TableCell>
            <TableCell className="min-w-0 max-[1024px]:grid max-[1024px]:grid-cols-[5.5rem_minmax(0,1fr)] max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-2">
              <span className="font-medium text-workspace-muted min-[1025px]:hidden">常用入口</span>
              <span className="flex min-w-0 flex-wrap gap-1.5">
                <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + item.id + '/students'}><UsersRound aria-hidden="true" className="size-4" />学生名单</Link></Button>
                <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + item.id + '/prizes'}><Gift aria-hidden="true" className="size-4" />奖品与库存</Link></Button>
                <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + item.id + '/lotteries'}><Ticket aria-hidden="true" className="size-4" />抽奖场次</Link></Button>
                <Button asChild variant="quiet" size="sm"><Link href={'/classes/' + item.id + '/winnings'}><ReceiptText aria-hidden="true" className="size-4" />中奖与兑换</Link></Button>
              </span>
            </TableCell>
            <TableCell className="max-[1024px]:grid max-[1024px]:grid-cols-[5.5rem_minmax(0,1fr)] max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-2">
              <span className="font-medium text-workspace-muted min-[1025px]:hidden">主要操作</span><Button asChild variant="secondary" size="sm"><Link href={'/classes/' + item.id}><ArrowRight aria-hidden="true" className="size-4" />进入班级</Link></Button>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      </CardContent>
    </Card>}
  </section>;
}
