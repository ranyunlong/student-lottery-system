import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { classes } from '../../../../db/schema';
import { listStudents } from '../../../../features/students/service';
import { listPrizes } from '../../../../features/prizes/service';
import { listSessions } from '../../../../features/lotteries/sessions';
import { listWinnings } from '../../../../features/redemptions/service';
import { requireClassAccess } from '../../../../lib/access';

export default async function ClassHomePage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireClassAccess(classId);
  const [[classRow], students, prizes, sessions, winnings] = await Promise.all([
    db.select({ name: classes.name, archived: classes.archived }).from(classes).where(and(eq(classes.id, classId), eq(classes.archived, false))).limit(1),
    listStudents(classId), listPrizes(classId), listSessions(classId), listWinnings(classId),
  ]);
  if (!classRow) return <p>班级不存在或已归档。</p>;
  const activeSessions = sessions.filter((item) => item.status === 'active').length;
  const stock = prizes.filter((item) => !item.archived).reduce((sum, item) => sum + item.stock, 0);
  return <section className="min-w-0 space-y-6">
    <header className="border-b border-slate-200 pb-4"><Link href="/classes" className="text-sm text-teal-800 hover:underline">老师工作区</Link><h1 className="mt-2 break-words text-2xl font-semibold">{classRow.name}</h1></header>
    <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 border-y border-slate-200 py-5 text-sm sm:grid-cols-4"><div><dt className="text-slate-600">学生</dt><dd className="mt-1 text-xl font-semibold">{students.filter((item) => !item.archived).length}</dd></div><div><dt className="text-slate-600">可用库存</dt><dd className="mt-1 text-xl font-semibold">{stock}</dd></div><div><dt className="text-slate-600">进行中场次</dt><dd className="mt-1 text-xl font-semibold">{activeSessions}</dd></div><div><dt className="text-slate-600">中奖记录</dt><dd className="mt-1 text-xl font-semibold">{winnings.length}</dd></div></dl>
    <nav aria-label="班级工作区" className="grid min-w-0 gap-3 sm:grid-cols-2"><Link className="min-h-11 border border-slate-300 bg-white px-4 py-3 font-medium hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + classId + '/students'}>学生名单</Link><Link className="min-h-11 border border-slate-300 bg-white px-4 py-3 font-medium hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + classId + '/prizes'}>奖品与库存</Link><Link className="min-h-11 border border-slate-300 bg-white px-4 py-3 font-medium hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + classId + '/lotteries'}>抽奖场次</Link><Link className="min-h-11 border border-slate-300 bg-white px-4 py-3 font-medium hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" href={'/classes/' + classId + '/winnings'}>中奖与兑换</Link></nav>
  </section>;
}
