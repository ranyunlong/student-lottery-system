import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ActionForm } from '../../../../../components/action-form';
import { db } from '../../../../../db/client';
import { classes } from '../../../../../db/schema';
import { adjustStockAction, archivePrizeAction, createPrizeAction } from '../../../../../features/prizes/actions';
import { listPrizes, listStockEvents } from '../../../../../features/prizes/service';
import { requireClassAccess } from '../../../../../lib/access';

const input = 'min-h-10 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700';
const label = 'flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-700';

export default async function PrizesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireClassAccess(classId);
  const [items, [target]] = await Promise.all([
    listPrizes(classId), db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1),
  ]);
  const histories = await Promise.all(items.map((item) => listStockEvents(item.id)));
  return <section className="min-w-0 space-y-6">
    <div className="border-b border-slate-200 pb-4">
      <Link className="text-sm text-teal-800 hover:underline" href={'/classes/' + classId + '/students'}>学生名单</Link>
      <h1 className="mt-2 break-words text-2xl font-semibold">{target?.name} · 奖品与库存</h1>
    </div>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">创建奖品</h2>
      <ActionForm action={createPrizeAction} label="创建奖品">
        <input type="hidden" name="classId" value={classId} />
        <label className={label}>奖品名称<input className={input} name="name" required maxLength={200} /></label>
        <label className={label}>初始库存<input className={input} name="openingStock" type="number" min="0" max="2147483647" step="1" required /></label>
      </ActionForm>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">奖品清单</h2>
      {items.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {items.map((item, index) => <li key={item.id} className="space-y-4 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="break-words font-semibold">{item.name} {item.archived && <span className="text-sm font-normal text-slate-500">已归档</span>}</h3>
            <span className="text-sm tabular-nums">库存 {item.stock}</span>
          </div>
          {!item.archived && <div className="space-y-3">
            <ActionForm action={adjustStockAction} label="调整库存">
              <input type="hidden" name="classId" value={classId} /><input type="hidden" name="prizeId" value={item.id} />
              <label className={label}>增减数量<input className={input} name="delta" type="number" step="1" min="-2147483647" max="2147483647" required placeholder="例如 -1 或 5" /></label>
              <label className={label}>原因<input className={input} name="reason" required maxLength={500} /></label>
            </ActionForm>
            <ActionForm action={archivePrizeAction} label="归档" confirm={`确定归档“${item.name}”？`}>
              <input type="hidden" name="classId" value={classId} /><input type="hidden" name="prizeId" value={item.id} />
            </ActionForm>
          </div>}
          <details className="text-sm">
            <summary className="cursor-pointer text-teal-800">库存流水（{histories[index].length}）</summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {histories[index].map((event, eventIndex) => <li key={eventIndex} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                <time className="text-slate-500" dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>
                <span className="tabular-nums">{event.delta > 0 ? '+' : ''}{event.delta}</span>
                <span className="break-words">{event.reason}</span>
                <span className="break-all text-slate-500">操作人 {event.actorId}</span>
              </li>)}
            </ul>
          </details>
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无奖品。</p>}
    </section>
  </section>;
}
