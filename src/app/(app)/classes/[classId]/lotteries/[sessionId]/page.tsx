import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, CircleAlert, ReceiptText } from 'lucide-react';
import { db } from '../../../../../../db/client';
import { classes, lotteryRounds } from '../../../../../../db/schema';
import { ClassWorkspaceNav } from '../../../../../../components/class-workspace-nav';
import { ClassEmblem } from '../../../../teacher/class-emblem';
import { Badge } from '../../../../../../components/ui/badge';
import { Button } from '../../../../../../components/ui/button';
import { StatusMessage } from '../../../../../../components/ui/status-message';
import { ProductionDrawStage, type DrawStageSession } from '../../../../../../features/lotteries/draw-stage';
import { getSession } from '../../../../../../features/lotteries/sessions';
import { listPrizes } from '../../../../../../features/prizes/service';
import { listStudents } from '../../../../../../features/students/service';
import { listWinnings } from '../../../../../../features/redemptions/service';
import { SessionResults } from '../../../../../../features/lotteries/session-results';
import styles from '../../../../../../features/lotteries/onsite-screen.module.css';
import { requireClassAccess } from '../../../../../../lib/access';

export default async function LotteryLivePage({ params, searchParams }: {
  params: Promise<{ classId: string; sessionId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ classId, sessionId }, { view }] = await Promise.all([params, searchParams]);
  await requireClassAccess(classId);
  const session = await getSession(sessionId);
  if (session.classId !== classId) throw new Error('场次不属于当前班级');
  if (session.status === 'completed' || (session.status === 'active' && view === 'results')) {
    const [[classRow], wins] = await Promise.all([
      db.select({ name: classes.name, emblemPath: classes.emblemPath }).from(classes).where(and(eq(classes.id, classId), eq(classes.archived, false))).limit(1),
      listWinnings(classId),
    ]);
    return <SessionResults classId={classId} className={classRow?.name ?? '班级'} sessionId={sessionId} sessionTitle={session.title} sessionStatus={session.status} mode={session.mode} wins={wins} />;
  }
  const [[classRow], students, prizes, wins, [activeRound]] = await Promise.all([
    db.select({ name: classes.name, emblemPath: classes.emblemPath }).from(classes).where(and(eq(classes.id, classId), eq(classes.archived, false))).limit(1),
    listStudents(classId), listPrizes(classId), listWinnings(classId),
    db.select({ token: lotteryRounds.startToken, studentId: lotteryRounds.studentId }).from(lotteryRounds).where(and(eq(lotteryRounds.sessionId, sessionId), eq(lotteryRounds.status, 'active'))).limit(1),
  ]);
  if (session.status !== 'active') return <section className="min-w-0 space-y-6"><ClassWorkspaceNav classId={classId} active="lotteries" /><header className="border-b border-workspace-line pb-5"><h1 className="text-2xl font-semibold tracking-tight text-workspace-ink">场次不可抽奖</h1></header><StatusMessage tone="warning"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />当前场次不是进行中状态。</StatusMessage></section>;
  const sessionWins = wins.filter((item) => item.sessionId === sessionId);
  const studentWins = new Map<number, number>();
  const prizeWins = new Map<string, number>();
  for (const win of sessionWins) { studentWins.set(win.studentId, (studentWins.get(win.studentId) ?? 0) + 1); prizeWins.set(win.prizeId, (prizeWins.get(win.prizeId) ?? 0) + 1); }
  const candidates = session.studentIds.map((id) => { const student = students.find((item) => item.id === id); const remaining = session.mode === 'student-prize' ? Math.max(0, session.perStudentLimit - (studentWins.get(id) ?? 0)) : (studentWins.has(id) ? 0 : 1); return { id, name: student?.name ?? '未知学生', archived: student?.archived ?? true, remaining }; });
  let stageSession: DrawStageSession;
  if (session.mode === 'student-prize') {
    stageSession = { sessionId, mode: session.mode, candidates, prizes: session.prizes.map((item) => { const prize = prizes.find((row) => row.id === item.prizeId); return { id: item.prizeId, name: prize?.name ?? '未知奖品', stock: prize?.stock ?? 0, quotaRemaining: Math.max(0, item.quantity - (prizeWins.get(item.prizeId) ?? 0)) }; }), drawsRemaining: session.drawsRemaining, pendingToken: activeRound?.token, pendingStudentId: activeRound?.studentId ?? undefined };
  } else {
    const prize = prizes.find((row) => row.id === session.prizeId);
    const roundsRemaining = Math.max(0, session.roundCount - sessionWins.length);
    const candidateCapacity = candidates.filter((item) => item.remaining > 0 && !item.archived).length;
    const prizeCapacity = prize && !prize.archived ? roundsRemaining : 0;
    stageSession = { sessionId, mode: session.mode, candidates, prizes: [{ id: session.prizeId, name: prize?.name ?? '未知奖品', stock: prize?.stock ?? 0, quotaRemaining: roundsRemaining }], drawsRemaining: Math.min(prizeCapacity, candidateCapacity), pendingToken: activeRound?.token, pendingStudentId: activeRound?.studentId ?? undefined };
  }
  return <section role="region" aria-label="现场抽奖" className={`${styles.screen} fixed inset-0 z-[60] overflow-y-auto`}>
    <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col px-4 py-4 sm:px-8 sm:py-6">
      <header className={styles.topbar}>
        <div className={styles.branding}>
          {classRow?.emblemPath ? <ClassEmblem classId={classId} name={classRow.name} emblemPath={classRow.emblemPath} /> : <span role="img" aria-label={classRow?.name ?? '班级'} className="max-w-40 break-words text-sm font-semibold">{classRow?.name ?? '班级'}</span>}
          {session.title && <h1 className={styles.topTitle}>{session.title}</h1>}
        </div>
        <div className={styles.topActions}>
          <Badge tone="warning">进行中</Badge>
          <Button asChild variant="secondary"><Link className="min-h-11" href={`/classes/${classId}/lotteries`}><ArrowLeft aria-hidden="true" className="size-4" />退出现场抽奖</Link></Button>
          <Button asChild variant="quiet" size="sm"><Link className={styles.resultsLink} href={`/classes/${classId}/lotteries/${sessionId}?view=results`}><ReceiptText aria-hidden="true" className="size-4" />本场中奖记录</Link></Button>
        </div>
      </header>
      <ProductionDrawStage session={stageSession} />
    </div>
  </section>;
}
