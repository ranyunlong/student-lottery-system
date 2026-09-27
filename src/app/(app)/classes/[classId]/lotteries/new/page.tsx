import Link from 'next/link';
import { ActionForm } from '../../../../../../components/action-form';
import { saveSessionAction } from '../../../../../../features/lotteries/actions';
import { getSession } from '../../../../../../features/lotteries/sessions';
import { listPrizes } from '../../../../../../features/prizes/service';
import { listStudents } from '../../../../../../features/students/service';
import { requireClassAccess } from '../../../../../../lib/access';

const input = 'min-h-10 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700';
const label = 'flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-700';
export default async function SessionSetupPage({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ mode?: string; sessionId?: string }>;
}) {
  const { classId } = await params;
  const { mode: requestedMode, sessionId } = await searchParams;
  await requireClassAccess(classId);
  const existing = sessionId ? await getSession(sessionId) : null;
  if (existing && (existing.classId !== classId || existing.status !== 'draft')) throw new Error('只有本班草稿场次可以编辑');
  const mode = requestedMode === 'prize-student' || requestedMode === 'student-prize' ? requestedMode : existing?.mode ?? 'student-prize';
  const [students, prizes] = await Promise.all([listStudents(classId), listPrizes(classId)]);
  const roster = students.filter((item) => !item.archived);
  const stock = prizes.filter((item) => !item.archived);
  const selected = existing?.mode === mode ? existing : null;
  const query = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
  return <section className="min-w-0 space-y-6">
    <header className="border-b border-slate-200 pb-4"><Link className="text-sm text-teal-800 hover:underline" href={`/classes/${classId}/lotteries`}>返回场次</Link>
      <h1 className="mt-2 text-2xl font-semibold">{existing ? '编辑场次草稿' : '新建抽奖场次'}</h1></header>
    <nav aria-label="抽奖模式" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm">
      <Link aria-current={mode === 'student-prize' ? 'page' : undefined} className={`rounded px-3 py-2 ${mode === 'student-prize' ? 'bg-teal-700 text-white' : 'bg-white text-teal-800'}`} href={`?mode=student-prize${query}`}>指定学生 · 随机奖品</Link>
      <Link aria-current={mode === 'prize-student' ? 'page' : undefined} className={`rounded px-3 py-2 ${mode === 'prize-student' ? 'bg-teal-700 text-white' : 'bg-white text-teal-800'}`} href={`?mode=prize-student${query}`}>指定奖品 · 随机学生</Link>
    </nav>
    <ActionForm action={saveSessionAction} label="保存草稿" successHref={`/classes/${classId}/lotteries`}>
      <input type="hidden" name="classId" value={classId} /><input type="hidden" name="mode" value={mode} />
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      <fieldset className="w-full space-y-2"><legend className="mb-2 font-semibold">候选学生</legend>
        {roster.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{roster.map((item) => <label key={item.id} className="flex min-w-0 items-center gap-2 text-sm">
          <input type="checkbox" name="studentIds" value={item.id} defaultChecked={selected?.studentIds.includes(item.id)} className="size-4 accent-teal-700" />
          <span className="break-words">{item.studentNumber} · {item.name}</span></label>)}</div> : <p className="text-sm text-slate-600">暂无可用学生，请先添加学生。</p>}
      </fieldset>
      {mode === 'student-prize' ? <>
        <label className={`${label} w-full max-w-xs`}>每人最多抽取次数<input className={input} type="number" name="perStudentLimit" min="1" max="2147483647" step="1" required defaultValue={selected?.mode === 'student-prize' ? selected.perStudentLimit : 1} /></label>
        <fieldset className="w-full space-y-2"><legend className="mb-2 font-semibold">候选奖品与本场上限</legend>
          {stock.length ? <div className="grid gap-3 sm:grid-cols-2">{stock.map((item) => {
            const quantity = selected?.mode === 'student-prize' ? selected.prizes.find((prize) => prize.prizeId === item.id)?.quantity : undefined;
            return <div key={item.id} className="flex items-end gap-3"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <input type="checkbox" name="prizeIds" value={item.id} defaultChecked={quantity !== undefined} className="size-4 accent-teal-700" />
              <span className="break-words">{item.name}（库存 {item.stock}）</span></label>
              <label className="w-24 text-xs text-slate-600">本场数量<input className={input} type="number" name={`quantity:${item.id}`} min="1" max={item.stock} step="1" defaultValue={quantity ?? 1} /></label></div>;
          })}</div> : <p className="text-sm text-slate-600">暂无可用奖品，请先创建奖品并补充库存。</p>}
        </fieldset>
      </> : <>
        <label className={`${label} w-full max-w-sm`}>固定奖品<select className={input} name="prizeId" required defaultValue={selected?.mode === 'prize-student' ? selected.prizeId : ''}>
          <option value="">请选择奖品</option>{stock.map((item) => <option key={item.id} value={item.id}>{item.name}（库存 {item.stock}）</option>)}
        </select></label>
        <label className={`${label} w-full max-w-xs`}>抽取轮数<input className={input} type="number" name="roundCount" min="1" max="2147483647" step="1" required defaultValue={selected?.mode === 'prize-student' ? selected.roundCount : 1} /></label>
      </>}
    </ActionForm>
  </section>;
}
