import Link from 'next/link';
import { ArrowRight, UsersRound } from 'lucide-react';
import { listTeacherClasses } from '../../../features/classes/service';
import { requireTeacherPage } from '../../../lib/workspace-guard';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { ClassEmblem } from '../teacher/class-emblem';
import { withTeacherClassEmblems } from '../teacher/teacher-classes';

export default async function ClassesPage() {
  await requireTeacherPage();
  const classes = await withTeacherClassEmblems(await listTeacherClasses());
  return <section className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-workspace-line pb-5">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold text-workspace-accent-strong">班级管理</p>
        <h1 className="break-words text-xl font-semibold text-workspace-ink">园丁工作区</h1>
      </div>
      <Badge tone="accent">{classes.length} 个班级</Badge>
    </header>
    {classes.length ? <div className="overflow-hidden border-y border-workspace-line bg-white">
      <Table>
        <TableCaption className="sr-only">班级</TableCaption>
        <TableHeader className="max-[1024px]:sr-only"><TableRow><TableHead>班级</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{classes.map((item) => <TableRow key={item.id} className="max-[1024px]:block max-[1024px]:px-4 max-[1024px]:py-3 min-[1025px]:bg-white">
          <TableCell className="min-w-0 max-[1024px]:grid max-[1024px]:grid-cols-[3.5rem_minmax(0,1fr)] max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-3 min-[1025px]:w-[55%]">
            <span className="font-medium text-workspace-muted min-[1025px]:hidden">班级</span>
            <span className="flex min-w-0 items-center gap-3">
              <ClassEmblem classId={item.id} name={item.name} emblemPath={item.emblemPath} />
              <span className="min-w-0 break-words font-semibold text-workspace-ink">{item.name}</span>
            </span>
          </TableCell>
          <TableCell className="max-[1024px]:grid max-[1024px]:grid-cols-[5.5rem_minmax(0,1fr)] max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-2">
            <span className="font-medium text-workspace-muted min-[1025px]:hidden">操作</span><Button asChild variant="secondary"><Link href={'/classes/' + item.id}><ArrowRight aria-hidden="true" className="size-4" />进入班级</Link></Button>
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div> : <EmptyState icon={<UsersRound aria-hidden="true" className="size-5" />} title="尚未分配班级，请联系管理员。" />}
  </section>;
}
