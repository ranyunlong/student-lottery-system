'use server';

import { eq } from 'drizzle-orm';
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
  const [row] = await db.select({ classId: lotteryRounds.classId }).from(lotteryRounds).where(eq(lotteryRounds.startToken, token));
  if (row) revalidatePath('/classes/' + row.classId + '/lotteries');
}

function message(error: unknown) { return error instanceof Error ? error.message : '操作失败'; }

export async function startRoundAction(data: FormData): Promise<StartResult> {
  try {
    const sessionId = field(data, 'sessionId');
    const { userId } = await requireSession();
    const started = await startRound(sessionId, userId, selectedStudent(data));
    const [row] = await db.select({ classId: lotterySessions.classId }).from(lotterySessions).where(eq(lotterySessions.id, sessionId));
    if (row) revalidatePath('/classes/' + row.classId + '/lotteries');
    return { ok: true, ...started };
  } catch (error) { return { ok: false, message: message(error) }; }
}

export async function stopRoundAction(data: FormData): Promise<StopResult> {
  try {
    const token = field(data, 'token');
    const { userId } = await requireSession();
    const result = await stopRound(token, userId);
    await refreshRound(token);
    return { ok: true, result };
  } catch (error) { return { ok: false, message: message(error) }; }
}

export async function cancelRoundAction(data: FormData): Promise<CancelResult> {
  try {
    const token = field(data, 'token');
    const { userId } = await requireSession();
    await cancelRound(token, userId);
    await refreshRound(token);
    return { ok: true };
  } catch (error) { return { ok: false, message: message(error) }; }
}
