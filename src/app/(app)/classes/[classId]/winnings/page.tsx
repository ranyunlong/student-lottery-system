import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ActionForm } from '../../../../../components/action-form';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { redeemWinAction } from '../../../../../features/redemptions/actions';
import { listWinnings } from '../../../../../features/redemptions/service';
import { requireClassAccess } from '../../../../../lib/access';

const date = (value: Date) => value.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

export default async function WinningsPage({ params, searchParams }: {
  params: Promise<{ classId: string }>; searchParams: Promise<{ status?: string }>;
}) {
  const { classId } = await params;
  const { status } = await searchParams;
  await requireClassAccess(classId);
  const selected = status === 'redeemed' ? 'redeemed' : 'pending';
  const [pending, redeemed, [target]] = await Promise.all([
    listWinnings(classId, 'pending'), listWinnings(classId, 'redeemed'),
    db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
  ]);
  const items = selected === 'pending' ? pending : redeemed;
  return <section className="min-w-0 space-y-6">
    <header className="border-b border-slate-200 pb-4">
      <Link className="text-sm text-teal-800 hover:underline" href={'/classes/' + classId + '/lotteries'}>抽奖场次</Link>
      <h1 className="mt-2 break-words text-2xl font-semibold">{target?.name} · 中奖历史</h1>
    </header>
    <nav aria-label="兑换状态" className="flex gap-4 border-b border-slate-200 text-sm font-medium">
      <Link aria-current={selected === 'pending' ? 'page' : undefined} className={`border-b-2 px-1 py-2 ${selected === 'pending' ? 'border-teal-700 text-teal-900' : 'border-transparent text-slate-600 hover:text-teal-800'}`}
        href={'/classes/' + classId + '/winnings'}>待兑（{pending.length}）</Link>
      <Link aria-current={selected === 'redeemed' ? 'page' : undefined} className={`border-b-2 px-1 py-2 ${selected === 'redeemed' ? 'border-teal-700 text-teal-900' : 'border-transparent text-slate-600 hover:text-teal-800'}`}
        href={'/classes/' + classId + '/winnings?status=redeemed'}>已兑（{redeemed.length}）</Link>
    </nav>
    {items.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
      {items.map((win) => <li key={win.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 text-sm">
        <div className="min-w-0 space-y-1">
          <p className="break-words font-semibold">{win.studentNumberSnapshot} · {win.studentNameSnapshot} <span className="font-normal text-slate-600">获得</span> {win.prizeNameSnapshot}</p>
          <p className="text-slate-600">抽中 <time dateTime={win.createdAt.toISOString()}>{date(win.createdAt)}</time></p>
          {win.redeemedAt && <p className="text-slate-600">兑换 <time dateTime={win.redeemedAt.toISOString()}>{date(win.redeemedAt)}</time> · 操作老师 {win.redeemedByName ?? win.redeemedBy}</p>}
        </div>
        {selected === 'pending' && <ActionForm action={redeemWinAction} label="标记已兑换" confirm={`确定将“${win.studentNameSnapshot} · ${win.prizeNameSnapshot}”标记为已兑换？`}>
          <input type="hidden" name="classId" value={classId} /><input type="hidden" name="winId" value={win.id} />
        </ActionForm>}
      </li>)}
    </ul> : <p className="text-sm text-slate-600">{selected === 'pending' ? '暂无待兑换记录。' : '暂无已兑换记录。'}</p>}
  </section>;
}
