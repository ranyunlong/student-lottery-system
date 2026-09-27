'use server';

import { DrizzleQueryError, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '../../db/client';
import { lotteryRounds, lotterySessions } from '../../db/schema';
import { requireSession } from '../../lib/access';
import { cancelRound, startRound, stopRound } from './rounds';
import type { DrawResult } from './types';

type StartResult = { ok: true; roundId: string; token: string } | { ok: false; message: string };
type StopResult = { ok: true; result: DrawResult } | { ok: false; message: string };
type CancelResult = { ok: true } | { ok: false; message: string };

function field(data: FormData, key: string) {
  const value = data.get(key);
  if (typeof value !== 'string' || !value) throw new Error('表单数据无效');
  return value;
}

function selectedStudent(data: FormData): number | undefined {
  const raw = data.get('selectedStudentId');
  if (raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new Error('候选学生无效');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('候选学生无效');
  return value;
}

async function refreshRound(token: string) {
  const [row] = await db.select({ classId: lotteryRounds.classId, sessionId: lotteryRounds.sessionId })
    .from(lotteryRounds).where(eq(lotteryRounds.startToken, token));
  if (row) {
    revalidatePath('/classes/' + row.classId + '/lotteries');
    revalidatePath('/classes/' + row.classId + '/lotteries/' + row.sessionId);
  }
}

function message(error: unknown) {
  if (error instanceof DrizzleQueryError) return '操作失败，请重试';
  return error instanceof Error ? error.message : '操作失败';
}

async function refreshAfterCommit(refresh: () => Promise<void> | void) {
  try { await refresh(); }
  catch {
    // The database operation has committed; cache failure cannot change its result.
  }
}

export async function startRoundAction(data: FormData): Promise<StartResult> {
  let sessionId: string;
  let started: Awaited<ReturnType<typeof startRound>>;
  try {
    sessionId = field(data, 'sessionId');
    const { userId } = await requireSession();
    started = await startRound(sessionId, userId, selectedStudent(data));
  } catch (error) { return { ok: false, message: message(error) }; }
  await refreshAfterCommit(async () => {
    const [row] = await db.select({ classId: lotterySessions.classId }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
    if (row) revalidatePath('/classes/' + row.classId + '/lotteries');
  });
  return { ok: true, ...started };
}

export async function stopRoundAction(data: FormData): Promise<StopResult> {
  let token: string;
  let result: DrawResult;
  try {
    token = field(data, 'token');
    const { userId } = await requireSession();
    result = await stopRound(token, userId);
  } catch (error) { return { ok: false, message: message(error) }; }
  await refreshAfterCommit(() => refreshRound(token));
  return { ok: true, result };
}

export async function cancelRoundAction(data: FormData): Promise<CancelResult> {
  let token: string;
  try {
    token = field(data, 'token');
    const { userId } = await requireSession();
    await cancelRound(token, userId);
  } catch (error) { return { ok: false, message: message(error) }; }
  await refreshAfterCommit(() => refreshRound(token));
  return { ok: true };
}
