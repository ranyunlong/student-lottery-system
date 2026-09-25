import Link from 'next/link';
import { ActionForm } from '../../../../components/action-form';
import { listAdminAudit } from '../../../../features/classes/service';
import { correctRedemptionAction } from '../../../../features/redemptions/actions';
import { listRedemptionAudit } from '../../../../features/redemptions/service';
import { requireAdminPage } from '../../../../lib/workspace-guard';

const date = (value: Date) => value.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

export default async function AuditPage() {
  await requireAdminPage();
  const [redemptions, administration] = await Promise.all([listRedemptionAudit(), listAdminAudit()]);
  return <section className="min-w-0 space-y-8">
    <header className="border-b border-slate-200 pb-4"><h1 className="text-2xl font-semibold">审计记录</h1></header>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">兑换与纠错</h2>
      {redemptions.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {redemptions.map((event) => <li key={event.id} className="space-y-2 px-4 py-4 text-sm">
          <p className="break-words font-medium">{event.studentNumberSnapshot} · {event.studentNameSnapshot} · {event.prizeNameSnapshot}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
            <time dateTime={event.createdAt.toISOString()}>{date(event.createdAt)}</time>
            <span>{event.previousStatus === 'pending' ? '待兑' : '已兑'} → {event.newStatus === 'pending' ? '待兑' : '已兑'}</span>
            <span>操作人 {event.actorName}</span>
            <Link className="text-teal-800 hover:underline" href={'/classes/' + event.classId + '/winnings'}>查看班级中奖记录</Link>
          </p>
          {event.reason && <p className="break-words">纠错原因：{event.reason}</p>}
          {event.newStatus === 'redeemed' && event.currentStatus === 'redeemed'
            && redemptions.find((entry) => entry.winningRecordId === event.winningRecordId)?.id === event.id
            && <ActionForm action={correctRedemptionAction} label="纠正误标" confirm="确定将这条记录恢复为待兑？">
            <input type="hidden" name="winId" value={event.winningRecordId} />
            <label className="flex min-w-0 flex-col gap-1 font-medium text-slate-700">纠错原因
              <input className="min-h-10 w-full rounded border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700" name="reason" required maxLength={500} />
            </label>
          </ActionForm>}
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无兑换记录。</p>}
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">管理操作</h2>
      {administration.length ? <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white text-sm">
        {administration.map((event) => <li key={event.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
          <time className="text-slate-600" dateTime={event.createdAt.toISOString()}>{date(event.createdAt)}</time>
          <span>{event.action}</span><span className="break-all text-slate-600">操作人 {event.actorId}</span>
        </li>)}
      </ul> : <p className="text-sm text-slate-600">暂无管理操作。</p>}
    </section>
  </section>;
}
