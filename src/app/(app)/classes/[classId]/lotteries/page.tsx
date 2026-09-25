import Link from 'next/link';
import { ActionForm } from '../../../../../components/action-form';
import { activateSessionAction, completeSessionAction } from '../../../../../features/lotteries/actions';
import { listSessions } from '../../../../../features/lotteries/sessions';

const labels = { draft: '草稿', active: '进行中', completed: '已完成' };
export default async function LotteriesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const sessions = await listSessions(classId);
  return <section className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div><Link href={'/classes/' + classId + '/prizes'} className="text-sm text-teal-800 hover:underline">奖品与库存</Link>
        <h1 className="mt-2 text-2xl font-semibold">抽奖场次</h1></div>
      <Link href={'/classes/' + classId + '/lotteries/new'} className="rounded bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">新建场次</Link>
    </header>
    {sessions.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
      {sessions.map((item) => <li key={item.id} className="space-y-2 py-4">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="font-semibold">{item.mode === 'student-prize' ? '指定学生 · 随机奖品' : '指定奖品 · 随机学生'}</h2>
          <span className="text-sm text-slate-600">{labels[item.status]}</span></div>
        <p className="text-sm text-slate-600">候选学生 {item.studentIds.length} 人 · {item.mode === 'student-prize' ? `候选奖品 ${item.prizes.length} 种 · 每人最多 ${item.perStudentLimit} 次` : `抽取 ${item.roundCount} 轮`}</p>
        {item.status === 'draft' && <div className="flex flex-wrap items-center gap-4">
          <Link className="text-sm text-teal-800 hover:underline" href={`/classes/${classId}/lotteries/new?sessionId=${item.id}&mode=${item.mode}`}>编辑配置</Link>
          <ActionForm action={activateSessionAction} label="开始场次"><input type="hidden" name="sessionId" value={item.id} /></ActionForm>
        </div>}
        {item.status === 'active' && <ActionForm action={completeSessionAction} label="结束场次" confirm="确定结束这个场次？结束后不能继续抽取。">
          <input type="hidden" name="sessionId" value={item.id} />
        </ActionForm>}
      </li>)}
    </ul> : <p className="text-sm text-slate-600">暂无场次。</p>}
  </section>;
}
