'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DrawResult } from './types';
import { cancelRoundAction, startRoundAction, stopRoundAction } from './rounds.actions';

export type DrawStageSession = {
  sessionId?: string;
  mode: 'student-prize' | 'prize-student';
  candidates: { id: number; name: string; remaining: number }[];
  prizes: { id: string; name: string; stock: number; quotaRemaining: number }[];
  drawsRemaining: number;
  pendingToken?: string;
};

export type DrawStageActions = {
  start(studentId?: number): Promise<{ token: string }>;
  stop(token: string): Promise<DrawResult>;
  cancel(token: string): Promise<void>;
};

type Props = { session: DrawStageSession; actions: DrawStageActions };
const pendingKey = (sessionId?: string) => 'student-lottery:pending-round:' + (sessionId ?? 'current');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';

export function DrawStage({ session, actions }: Props) {
  const availableCandidates = useMemo(() => session.candidates.filter((item) => item.remaining > 0), [session.candidates]);
  const fixedPrize = session.prizes[0];
  const unavailableStudents = availableCandidates.length === 0 || session.drawsRemaining <= 0;
  const outOfStock = session.prizes.every((item) => item.stock <= 0 || item.quotaRemaining <= 0);
  const [selectedStudent, setSelectedStudent] = useState(session.pendingToken && session.mode === 'student-prize' ? String(availableCandidates[0]?.id ?? '') : '');
  const [token, setToken] = useState(session.pendingToken ?? '');
  const [running, setRunning] = useState(Boolean(session.pendingToken));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [ticker, setTicker] = useState(session.candidates[0]?.name ?? '等待开始');

  useEffect(() => {
    if (!running || session.candidates.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => setTicker((current) => {
      const index = session.candidates.findIndex((item) => item.name === current);
      return session.candidates[(index + 1) % session.candidates.length]?.name ?? current;
    }), 120);
    return () => window.clearInterval(interval);
  }, [running, session.candidates]);

  async function start() {
    if (busy || running || session.drawsRemaining <= 0 || outOfStock || (session.mode === 'student-prize' && !selectedStudent)) return;
    setBusy(true); setError('');
    try {
      const started = await actions.start(session.mode === 'student-prize' ? Number(selectedStudent) : undefined);
      setToken(started.token); setRunning(true); localStorage.setItem(pendingKey(session.sessionId), started.token);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  async function stop() {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const committed = await actions.stop(token);
      setResult(committed); setRunning(false); setToken(''); localStorage.removeItem(pendingKey(session.sessionId));
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      await actions.cancel(token);
      setRunning(false); setToken(''); if (session.mode === 'student-prize' && !selectedStudent) setSelectedStudent(String(availableCandidates[0]?.id ?? '')); localStorage.removeItem(pendingKey(session.sessionId));
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  const canStart = !busy && !running && session.drawsRemaining > 0 && !outOfStock
    && (session.mode === 'prize-student' || Boolean(selectedStudent));
  const stageClass = running ? 'motion-safe:animate-pulse' : '';

  return <section aria-labelledby="draw-stage-title" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 id="draw-stage-title" className="text-xl font-semibold">现场抽奖</h2><p className="mt-1 text-sm text-slate-600">只显示服务端确认的中奖结果。</p></div>
      <div className="shrink-0 text-right text-sm text-slate-600"><p>剩余次数 <strong className="text-slate-900">{session.drawsRemaining}</strong></p>{fixedPrize && <p>固定奖品库存 <strong className="text-slate-900">{fixedPrize.stock}</strong></p>}</div>
    </div>
    <div className="border-y border-slate-200 py-6">
      {session.mode === 'student-prize' ? <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-700">本轮学生
        <select aria-describedby="candidate-help" value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} disabled={running || busy} className="min-h-11 w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-teal-700">
          <option value="">请选择学生</option>{session.candidates.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.remaining <= 0}>{candidate.name}（剩余 {candidate.remaining} 次）</option>)}
        </select>
      </label> : <p className="min-h-11 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium">固定奖品：{fixedPrize?.name ?? '暂无奖品'}</p>}
      <div id="candidate-help" className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-3"><p>可用学生 <strong className="text-slate-900">{availableCandidates.length}</strong> 人</p>{session.prizes.map((prize) => <p key={prize.id} className="min-w-0 break-words">{prize.name}：库存 {prize.stock} · 配额 {prize.quotaRemaining}</p>)}</div>
    </div>
    {unavailableStudents && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 px-3 py-3 text-sm text-amber-900">没有可用的候选学生或抽奖次数已用尽</p>}
    {outOfStock && <p role="status" className="border-l-4 border-amber-500 bg-amber-50 px-3 py-3 text-sm text-amber-900">奖品库存已耗尽</p>}
    {session.pendingToken && running && !result && <p role="status" className="text-sm text-teal-800">已恢复进行中的轮次</p>}{running && <p role="status" className="text-sm text-teal-800">抽奖进行中</p>}
    {error && <div role="alert" className="flex min-w-0 flex-wrap items-center gap-3 border-l-4 border-red-600 bg-red-50 px-3 py-3 text-sm text-red-800"><span className="min-w-0 break-words">{error}</span>{running && <button type="button" onClick={stop} disabled={busy} className="min-h-11 shrink-0 rounded border border-red-700 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-red-700">重试停止</button>}</div>}
    <div aria-live="polite" className={'flex min-h-32 min-w-0 items-center justify-center border border-slate-200 bg-white px-4 py-8 text-center text-2xl font-semibold text-slate-900 ' + stageClass}>{result ? <p className="min-w-0 break-words"><span>{result.studentName}</span><span aria-hidden="true"> · </span><span>{result.prizeName}</span></p> : running ? <p className="min-w-0 break-words">{ticker}</p> : <p className="text-lg text-slate-500">准备好后开始</p>}</div>
    <div className="flex flex-wrap gap-3">
      {!running && !result && <button type="button" onClick={start} disabled={!canStart} className="min-h-11 min-w-32 rounded bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-2 focus-visible:outline-teal-700">开始抽奖</button>}
      {running && <><button type="button" onClick={stop} disabled={busy} className="min-h-11 min-w-32 rounded bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-300 focus-visible:outline-2 focus-visible:outline-teal-700">停止</button><button type="button" onClick={cancel} disabled={busy} className="min-h-11 min-w-32 rounded border border-slate-400 bg-white px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-teal-700">取消轮次</button></>}
    </div>
    {result && <p role="status" className="border-l-4 border-teal-600 bg-teal-50 px-3 py-3 text-sm text-teal-900">中奖结果已由服务端确认并保存。</p>}
  </section>;
}

export function ProductionDrawStage({ session }: { session: DrawStageSession }) {
  const actions: DrawStageActions = {
    start: async (studentId) => {
      const data = new FormData(); data.set('sessionId', session.sessionId ?? ''); if (studentId !== undefined) data.set('selectedStudentId', String(studentId));
      const response = await startRoundAction(data); if (!response.ok) throw new Error(response.message); return response;
    },
    stop: async (token) => { const data = new FormData(); data.set('token', token); const response = await stopRoundAction(data); if (!response.ok) throw new Error(response.message); return response.result; },
    cancel: async (token) => { const data = new FormData(); data.set('token', token); const response = await cancelRoundAction(data); if (!response.ok) throw new Error(response.message); },
  };
  return <DrawStage session={session} actions={actions} />;
}

