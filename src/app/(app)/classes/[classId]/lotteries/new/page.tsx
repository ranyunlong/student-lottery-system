import Link from 'next/link';
import { Gift, UsersRound } from 'lucide-react';
import { ClassWorkspaceNav } from '../../../../../../components/class-workspace-nav';
import { Badge } from '../../../../../../components/ui/badge';
import { Field } from '../../../../../../components/ui/field';
import { Input } from '../../../../../../components/ui/input';
import { StatusMessage } from '../../../../../../components/ui/status-message';
import { SessionSetupForm } from '../../../../../../features/lotteries/session-setup-form';
import { PrizeTransferBox, StudentTransferBox } from '../../../../../../features/lotteries/lottery-transfer-box';
import { getSession } from '../../../../../../features/lotteries/sessions';
import { listPrizes } from '../../../../../../features/prizes/service';
import { listStudents } from '../../../../../../features/students/service';
import { requireClassAccess } from '../../../../../../lib/access';

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
  const stock = prizes.filter((item) => !item.archived && item.stock > 0);
  const selected = existing?.mode === mode ? existing : null;
  const query = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
  return <section className="min-w-0 space-y-5">
    <ClassWorkspaceNav classId={classId} active="lotteries" />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-workspace-ink">{existing ? '编辑场次草稿' : '新建抽奖场次'}</h1>
      <Badge tone="accent">草稿配置</Badge>
    </header>
    <nav aria-label="抽奖模式" className="flex flex-wrap gap-1 border-y border-workspace-line bg-white px-2 text-sm">
      <Link aria-current={mode === 'student-prize' ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 font-semibold ${mode === 'student-prize' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:border-workspace-line hover:text-workspace-ink'}`} href={`?mode=student-prize${query}`}><UsersRound aria-hidden="true" className="size-4" />指定学生 · 随机奖品</Link>
      <Link aria-current={mode === 'prize-student' ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 font-semibold ${mode === 'prize-student' ? 'border-workspace-accent text-workspace-accent-strong' : 'border-transparent text-workspace-muted hover:border-workspace-line hover:text-workspace-ink'}`} href={`?mode=prize-student${query}`}><Gift aria-hidden="true" className="size-4" />指定奖品 · 随机学生</Link>
    </nav>
    <div className="border-y border-workspace-line bg-white px-4 py-4">
    <SessionSetupForm classId={classId} mode={mode} sessionId={sessionId}>
      <Field label="场次名称（选填）" className="w-full max-w-md"><Input type="text" name="title" maxLength={120} defaultValue={existing?.title ?? ''} /></Field>
      <fieldset className="w-full space-y-3 border-y border-workspace-line bg-workspace-surface px-4 py-4"><legend className="flex items-center gap-2 font-semibold text-workspace-ink"><UsersRound aria-hidden="true" className="size-4 text-workspace-accent" />候选学生</legend>
        {roster.length ? <StudentTransferBox items={roster.map((item) => ({ id: item.id, label: `${item.studentNumber} · ${item.name}` }))} initialSelectedIds={selected?.studentIds ?? []} /> : <StatusMessage tone="warning">暂无可用学生，请先添加学生。</StatusMessage>}
      </fieldset>
      {mode === 'student-prize' ? <>
        <fieldset className="w-full space-y-3 border-y border-workspace-line bg-workspace-surface px-4 py-4"><legend className="flex items-center gap-2 font-semibold text-workspace-ink"><Gift aria-hidden="true" className="size-4 text-workspace-accent" />候选奖品与本场上限</legend>
          {stock.length ? <PrizeTransferBox items={stock.map((item) => ({ id: item.id, name: item.name, stock: item.stock }))} initialQuantities={selected?.mode === 'student-prize' ? Object.fromEntries(selected.prizes.map((prize) => [prize.prizeId, prize.quantity])) : {}} /> : <StatusMessage tone="warning">暂无可用奖品，请先创建奖品并补充库存。</StatusMessage>}
        </fieldset>
      </> : <>
        <fieldset className="w-full space-y-3 border-y border-workspace-line bg-workspace-surface px-4 py-4"><legend className="font-semibold text-workspace-ink">固定奖品</legend>
          <PrizeTransferBox single items={stock.map((item) => ({ id: item.id, name: item.name, stock: item.stock }))} initialQuantities={selected?.mode === 'prize-student' ? { [selected.prizeId]: 1 } : {}} />
        </fieldset>
        <Field label="抽取轮数" className="w-full max-w-xs"><Input type="number" name="roundCount" min="1" max="2147483647" step="1" required defaultValue={selected?.mode === 'prize-student' ? selected.roundCount : 1} /></Field>
      </>}
      {mode === 'student-prize' && <Field label="每人最多抽取次数" className="w-64 max-w-full"><Input type="number" name="perStudentLimit" min="1" max="2147483647" step="1" required defaultValue={selected?.mode === 'student-prize' ? selected.perStudentLimit : 1} /></Field>}
    </SessionSetupForm>
    </div>
  </section>;
}
