import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../../db/client';
import { classes, lotteryRounds } from '../../../../../../db/schema';
import { ProductionDrawStage, type DrawStageSession } from '../../../../../../features/lotteries/draw-stage';
import { getSession } from '../../../../../../features/lotteries/sessions';
import { listPrizes } from '../../../../../../features/prizes/service';
import { listStudents } from '../../../../../../features/students/service';
import { listWinnings } from '../../../../../../features/redemptions/service';
import { requireClassAccess } from '../../../../../../lib/access';

export default async function LotteryLivePage({ params }: { params: Promise<{ classId: string; sessionId: string }> }) {
  const { classId, sessionId } = await params;
  await requireClassAccess(classId);
  const session = await getSession(sessionId);
  if (session.classId !== classId) throw new Error('场次不属于当前班级');
  const [[classRow], students, prizes, wins, [activeRound]] = await Promise.all([
    db.select({ name: classes.name }).from(classes).where(and(eq(classes.id, classId), eq(classes.archived, false))).limit(1),
    listStudents(classId), listPrizes(classId), listWinnings(classId),
    db.select({ token: lotteryRounds.startToken }).from(lotteryRounds).where(and(eq(lotteryRounds.sessionId, sessionId), eq(lotteryRounds.status, 'active'))).limit(1),
  ]);
  if (session.status !== 'active') return <section className="space-y-4"><Link href={'/classes/' + classId + '/lotteries'} className="text-sm text-teal-800 hover:underline">返回抽奖场次</Link><h1 className="text-2xl font-semibold">场次不可抽奖</h1><p className="text-sm text-slate-600">当前场次不是进行中状态。</p></section>;
  const sessionWins = wins.filter((item) => item.sessionId === sessionId);
  const studentWins = new Map<number, number>();
  const prizeWins = new Map<string, number>();
  for (const win of sessionWins) { studentWins.set(win.studentId, (studentWins.get(win.studentId) ?? 0) + 1); prizeWins.set(win.prizeId, (prizeWins.get(win.prizeId) ?? 0) + 1); }
  const candidates = session.studentIds.map((id) => { const student = students.find((item) => item.id === id); const remaining = session.mode === 'student-prize' ? Math.max(0, session.perStudentLimit - (studentWins.get(id) ?? 0)) : (studentWins.has(id) ? 0 : 1); return { id, name: student?.name ?? '未知学生', remaining }; });
  let stageSession: DrawStageSession;
  if (session.mode === 'student-prize') {
    stageSession = { sessionId, mode: session.mode, candidates, prizes: session.prizes.map((item) => { const prize = prizes.find((row) => row.id === item.prizeId); return { id: item.prizeId, name: prize?.name ?? '未知奖品', stock: prize?.stock ?? 0, quotaRemaining: Math.max(0, item.quantity - (prizeWins.get(item.prizeId) ?? 0)) }; }), drawsRemaining: session.prizes.reduce((sum, item) => sum + Math.max(0, item.quantity - (prizeWins.get(item.prizeId) ?? 0)), 0), pendingToken: activeRound?.token };
  } else {
    const prize = prizes.find((row) => row.id === session.prizeId);
    stageSession = { sessionId, mode: session.mode, candidates, prizes: [{ id: session.prizeId, name: prize?.name ?? '未知奖品', stock: prize?.stock ?? 0, quotaRemaining: Math.max(0, session.roundCount - sessionWins.length) }], drawsRemaining: Math.max(0, session.roundCount - sessionWins.length), pendingToken: activeRound?.token };
  }
  return <section className="min-w-0 space-y-6"><header className="border-b border-slate-200 pb-4"><Link href={'/classes/' + classId + '/lotteries'} className="text-sm text-teal-800 hover:underline">{classRow?.name ?? '班级'} · 抽奖场次</Link><h1 className="mt-2 break-words text-2xl font-semibold">{session.mode === 'student-prize' ? '指定学生 · 随机奖品' : '指定奖品 · 随机学生'}</h1><Link className="mt-2 inline-block text-sm text-teal-800 hover:underline" href={'/classes/' + classId + '/winnings'}>查看中奖记录</Link></header><ProductionDrawStage session={stageSession} /></section>;
}
