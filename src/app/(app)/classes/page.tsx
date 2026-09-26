import Link from 'next/link';
import { listTeacherClasses } from '../../../features/classes/service';
import { requireTeacherPage } from '../../../lib/workspace-guard';

export default async function ClassesPage() {
  await requireTeacherPage();
  const classes = await listTeacherClasses();
  return <section className="min-w-0 space-y-6">
    <header className="border-b border-slate-200 pb-4"><h1 className="break-words text-2xl font-semibold">老师工作区</h1><p className="mt-2 text-sm text-slate-600">选择班级开始管理名单、奖品和现场抽奖。</p></header>
    {classes.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
      {classes.map((item) => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-4 py-5">
        <h2 className="min-w-0 break-words text-lg font-semibold">{item.name}</h2>
        <Link className="min-h-11 rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + item.id}>进入班级</Link>
      </li>)}
    </ul> : <p className="text-sm text-slate-600">尚未分配班级，请联系管理员。</p>}
  </section>;
}
