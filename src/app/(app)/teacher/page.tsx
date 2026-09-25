import Link from 'next/link';
import { listTeacherClasses } from '../../../features/classes/service';
import { requireTeacherPage } from '../../../lib/workspace-guard';

export default async function TeacherPage() {
  await requireTeacherPage();
  const classes = await listTeacherClasses();
  return <section className="space-y-5">
    <div className="border-b border-slate-200 pb-4"><h1 className="text-2xl font-semibold">我的班级</h1></div>
    {classes.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
      {classes.map((item) => <li key={item.id} className="px-4 py-4 font-medium">
        <Link className="text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + item.id + '/students'}>{item.name} · 学生名单</Link>
      </li>)}
    </ul> : <p className="text-sm text-slate-600">尚未分配班级，请联系管理员。</p>}
  </section>;
}
