'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, LoaderCircle, Play, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import type { DrawResult } from './types';
import { startRoundAction, stopRoundAction } from './rounds.actions';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { StatusMessage } from '../../components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import styles from './onsite-screen.module.css';

export type DrawStageSession = {
  sessionId?: string;
  mode: 'student-prize' | 'prize-student';
  candidates: { id: number; name: string; remaining: number; archived?: boolean }[];
  prizes: { id: string; name: string; stock: number; quotaRemaining: number }[];
  drawsRemaining: number;
  pendingToken?: string;
  pendingStudentId?: number;
};

export type DrawStageActions = {
  start(studentId?: number): Promise<{ token: string }>;
  stop(token: string): Promise<DrawResult>;
};

type Props = { session: DrawStageSession; actions: DrawStageActions; immersive?: boolean };
const pendingKey = (sessionId?: string) => 'student-lottery:pending-round:' + (sessionId ?? 'current');
const soundSettingsKey = 'student-lottery:onsite-sound';
const soundSettingsEvent = 'student-lottery:sound-settings-change';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';

function getSoundVolume() {
  const stored = localStorage.getItem(soundSettingsKey);
  const saved = stored === null ? NaN : Number(stored);
  return Number.isFinite(saved) && saved >= 0 && saved <= 0.08 ? saved : 0.04;
}

function subscribeToSoundVolume(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(soundSettingsEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(soundSettingsEvent, onChange);
  };
}

export function DrawStage({ session, actions, immersive = false }: Props) {
  const router = useRouter();
  const availableCandidates = useMemo(() => session.candidates.filter((item) => item.remaining > 0 && !item.archived), [session.candidates]);
  const rollingItems = useMemo(() => session.mode === 'student-prize'
    ? session.prizes.filter((item) => item.stock > 0 && item.quotaRemaining > 0).map((item) => item.name)
    : availableCandidates.map((item) => item.name), [availableCandidates, session.mode, session.prizes]);
  const fixedPrize = session.mode === 'prize-student' ? session.prizes[0] : undefined;
  const unavailableStudents = availableCandidates.length === 0 || session.drawsRemaining <= 0;
  const outOfStock = session.prizes.every((item) => item.stock <= 0 || item.quotaRemaining <= 0);
  const [selectedStudent, setSelectedStudent] = useState(session.pendingToken && session.mode === 'student-prize'
    ? String(session.pendingStudentId ?? availableCandidates[0]?.id ?? '')
    : String(availableCandidates[0]?.id ?? ''));
  const [token, setToken] = useState(session.pendingToken ?? '');
  const [running, setRunning] = useState(Boolean(session.pendingToken));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [soundMuted, setSoundMuted] = useState(false);
  const soundVolume = useSyncExternalStore(subscribeToSoundVolume, getSoundVolume, () => 0.04);
  const ticker = rollingItems.length ? rollingItems[tickerIndex % rollingItems.length] : '等待开始';
  const selectedCandidateAvailable = availableCandidates.some((item) => String(item.id) === selectedStudent);
  const effectiveSelectedStudent = selectedStudent && !selectedCandidateAvailable
    ? String(availableCandidates[0]?.id ?? '') : selectedStudent;

  const playSoundCue = useCallback((frequency: number) => {
    if (!immersive || soundMuted || soundVolume <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    try {
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(soundVolume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      void context.resume().catch(() => {});
      oscillator.start(now);
      oscillator.stop(now + 0.17);
      oscillator.onended = () => { void context.close(); };
    } catch {
      // Sound is optional and must not interfere with round controls.
    }
  }, [immersive, soundMuted, soundVolume]);

  useEffect(() => {
    if (!running || rollingItems.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => {
      setTickerIndex((current) => (current + 1) % rollingItems.length);
      playSoundCue(620);
    }, 520);
    return () => window.clearInterval(interval);
  }, [playSoundCue, rollingItems, running]);

  async function start() {
    if (busy || running || session.drawsRemaining <= 0 || outOfStock || (session.mode === 'student-prize' && !effectiveSelectedStudent)) return;
    setBusy(true); setError('');
    try {
      const started = await actions.start(session.mode === 'student-prize' ? Number(effectiveSelectedStudent) : undefined);
      setToken(started.token); setRunning(true); localStorage.setItem(pendingKey(session.sessionId), started.token);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  async function stop() {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const committed = await actions.stop(token);
      setResult(committed); setRunning(false); setToken(''); localStorage.removeItem(pendingKey(session.sessionId));
      router.refresh();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  const canStart = !busy && !running && session.drawsRemaining > 0 && !outOfStock
    && (session.mode === 'prize-student' || availableCandidates.some((item) => String(item.id) === effectiveSelectedStudent));
  const slotItems = rollingItems.length ? [
    rollingItems[(tickerIndex + rollingItems.length - 1) % rollingItems.length],
    ticker,
    rollingItems[(tickerIndex + 1) % rollingItems.length],
  ] : [];

  return <section aria-labelledby="draw-stage-title" className={immersive ? styles.stage : 'min-w-0 space-y-5'}>
    <header className={immersive ? styles.stageHeading : 'flex flex-wrap items-center justify-between gap-3 border-b border-workspace-line pb-3'}>
      <div className="min-w-0"><h2 id="draw-stage-title" className={immersive ? styles.stageTitle : 'text-lg font-semibold text-workspace-ink'}>现场抽奖</h2></div>
      <div className="flex flex-wrap items-center justify-end gap-2"><Badge tone={session.drawsRemaining > 0 ? 'accent' : 'neutral'}>剩余次数 {session.drawsRemaining}</Badge>{fixedPrize && <Badge tone={fixedPrize.stock > 0 ? 'success' : 'warning'}>固定奖品库存 {fixedPrize.stock}</Badge>}{immersive && <>
        <Button type="button" variant="quiet" size="icon" aria-label={soundMuted ? '开启音效' : '静音音效'} aria-pressed={soundMuted} title={soundMuted ? '开启音效' : '静音音效'} onClick={() => setSoundMuted((muted) => !muted)}>
          {soundMuted ? <VolumeX aria-hidden="true" className="size-4" /> : <Volume2 aria-hidden="true" className="size-4" />}
        </Button>
        <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-workspace-muted"><span className="sr-only">音效音量</span><input aria-label="音效音量" type="range" min="0" max="0.08" step="0.01" value={soundVolume} onChange={(event) => {
          const volume = Number(event.target.value);
          localStorage.setItem(soundSettingsKey, String(volume));
          window.dispatchEvent(new Event(soundSettingsEvent));
        }} className="w-20 accent-workspace-accent" /><span aria-hidden="true">音量</span></label>
      </>}</div>
    </header>
    <div className={immersive ? styles.stageLayout : 'grid min-w-0 flex-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]'}>
      <section aria-labelledby="candidate-title" className={immersive ? styles.candidatePanel : 'min-w-0 space-y-4 rounded-md p-4 sm:p-5'}>
        <div className="flex items-center justify-between gap-3"><h3 id="candidate-title" className="text-sm font-semibold">候选与库存</h3><span className={immersive ? styles.candidateCount : 'text-sm text-workspace-muted'}>参与人数 {session.candidates.length} 人</span></div>
      {session.mode === 'student-prize' ? <Field label="本轮学生" className="max-w-xl">
        <Select id="lottery-student" aria-describedby="candidate-help" value={effectiveSelectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} disabled={running || busy}>
          <option value="">请选择学生</option>{session.candidates.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.remaining <= 0 || candidate.archived}>{candidate.name}（剩余 {candidate.remaining} 次）</option>)}
        </Select>
      </Field> : <div className="min-h-11 border border-workspace-line bg-workspace-surface px-3 py-3 text-sm font-medium text-workspace-ink">固定奖品：{fixedPrize?.name ?? '暂无奖品'}</div>}
        <div id="candidate-help" className={immersive ? styles.inventory : 'overflow-hidden border-y border-workspace-line'}>
          <Table><TableHeader><TableRow><TableHead>奖品</TableHead><TableHead>库存</TableHead><TableHead>剩余配额</TableHead></TableRow></TableHeader><TableBody>{session.prizes.map((prize) => <TableRow key={prize.id}><TableCell className="break-words">{prize.name}</TableCell><TableCell>{prize.stock}</TableCell><TableCell>{prize.quotaRemaining}</TableCell></TableRow>)}</TableBody></Table>
        </div>
      </section>
      <section aria-labelledby="phase-title" className={immersive ? styles.phasePanel : 'flex min-h-64 min-w-0 flex-col rounded-md border border-workspace-line bg-workspace-surface'}>
        <div className={immersive ? styles.phaseHeader : 'flex min-h-12 items-center justify-between gap-3 border-b border-workspace-line px-4'}><h3 id="phase-title" className="text-sm font-semibold">{result ? '本轮结果' : running ? '正在抽取' : '准备抽取'}</h3><span role="status" className={immersive ? styles.phaseStatus : 'text-sm font-medium text-workspace-muted'}>{result ? '已完成' : running ? '抽奖进行中' : '待开始'}</span></div>
        <div aria-label={result ? '中奖结果' : '抽取候选'} role="region" aria-live={running ? 'off' : 'polite'} aria-atomic="true" data-running={running} className={immersive ? styles.reel : 'flex min-h-44 flex-1 items-center justify-center px-4 py-8 text-center text-3xl font-semibold text-workspace-ink'}>
          {immersive ? <div className={styles.machine} data-phase={result ? 'result' : running ? 'running' : 'idle'}>
            <div className={styles.machineLabel}>{session.mode === 'student-prize' ? '幸运奖品' : '幸运同学'}</div>
            <div className={styles.slotWindows}>
              {result ? <div className={`${styles.slotWindow} ${styles.currentWindow}`} data-testid="slot-current">
                <span className={styles.slotText}>{session.mode === 'student-prize' ? result.prizeName : result.studentName}</span>
              </div> : running && rollingItems.length === 1 ? <div className={`${styles.slotWindow} ${styles.currentWindow}`} data-testid="slot-current"><span className={styles.slotText}>{ticker}</span></div> : running && slotItems.length ? slotItems.map((item, index) => <div key={index} className={`${styles.slotWindow} ${index === 1 ? styles.currentWindow : styles.sideWindow}`} data-testid="slot-window" aria-hidden={index !== 1}>
                <span key={`${tickerIndex}-${index}`} className={styles.slotText} data-testid={index === 1 ? 'slot-current' : undefined}>{item}</span>
              </div>) : <div className={`${styles.slotWindow} ${styles.currentWindow}`}><span className={styles.slotText}>等待开始</span></div>}
            </div>
            {result && <p className={styles.winnerLine}><CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />{session.mode === 'student-prize' ? result.studentName : result.prizeName}</p>}
          </div> : result ? <p className="flex min-w-0 flex-wrap items-center justify-center gap-2 break-words"><CheckCircle2 aria-hidden="true" className="size-6 text-workspace-success" /><span>{result.studentName}</span><span aria-hidden="true"> · </span><span>{result.prizeName}</span></p> : running ? <p className="min-w-0 break-words">{ticker}</p> : <p className="text-lg text-workspace-muted">等待开始</p>}
        </div>
      </section>
    </div>
    {unavailableStudents && <StatusMessage role="status" tone="warning"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />没有可用的候选学生或抽奖次数已用尽</StatusMessage>}
    {outOfStock && <StatusMessage role="status" tone="warning"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />奖品库存已耗尽</StatusMessage>}
    {session.pendingToken && running && !result && <StatusMessage role="status" tone="info">已恢复进行中的轮次</StatusMessage>}
    {error && <StatusMessage role="alert" tone="error" className="flex-wrap"><span className="min-w-0 flex-1 break-words">{error}</span>{running && <Button type="button" variant="secondary" size="sm" onClick={stop} disabled={busy} icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-4" />}>重试停止</Button>}</StatusMessage>}
    <div tabIndex={-1} className={immersive ? styles.toolbar : 'flex flex-wrap items-center gap-2 border-t border-workspace-line pt-3'}>
      {!running && (!result || canStart) && <Button type="button" onClick={result ? () => setResult(null) : start} disabled={!canStart} className={immersive ? styles.primaryAction : 'min-w-32'} icon={result ? <RotateCcw aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}>{result ? '下一轮' : '开始抽奖'}</Button>}
      {running && <Button type="button" onClick={stop} disabled={busy} className={immersive ? styles.primaryAction : 'min-w-32'} icon={busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Square aria-hidden="true" className="size-4 fill-current" />}>停止</Button>}
    </div>
    {result && <StatusMessage role="status" tone="success"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />中奖结果已由服务端确认并保存。</StatusMessage>}
  </section>;
}

export function ProductionDrawStage({ session }: { session: DrawStageSession }) {
  const actions: DrawStageActions = {
    start: async (studentId) => {
      const data = new FormData(); data.set('sessionId', session.sessionId ?? ''); if (studentId !== undefined) data.set('selectedStudentId', String(studentId));
      const response = await startRoundAction(data); if (!response.ok) throw new Error(response.message); return response;
    },
    stop: async (token) => { const data = new FormData(); data.set('token', token); const response = await stopRoundAction(data); if (!response.ok) throw new Error(response.message); return response.result; },
  };
  return <DrawStage session={session} actions={actions} immersive />;
}

