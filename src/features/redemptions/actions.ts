'use server';

import { DrizzleQueryError, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '../../db/client';
import { winningRecords } from '../../db/schema';
import { requireAdmin, requireSession } from '../../lib/access';
import { correctRedemption, redeemWin } from './service';

export type RedemptionActionResult = { ok: boolean; message: string };

function field(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== 'string' || !value) throw new Error('表单数据无效');
  return value;
}

function failure(error: unknown): RedemptionActionResult {
  return { ok: false, message: error instanceof DrizzleQueryError ? '操作失败，请重试'
    : error instanceof Error ? error.message : '操作失败' };
}

function refresh(classId: string) {
  try {
    revalidatePath('/classes/' + classId + '/winnings');
    revalidatePath('/admin/audit');
  } catch {
    // A failed cache refresh cannot undo a committed transition.
  }
}

export async function redeemWinAction(data: FormData): Promise<RedemptionActionResult> {
  let classId: string;
  try {
    classId = field(data, 'classId');
    const winId = field(data, 'winId');
    const { userId } = await requireSession();
    await redeemWin(classId, winId, userId);
  } catch (error) { return failure(error); }
  refresh(classId);
  return { ok: true, message: '已标记兑换' };
}

export async function correctRedemptionAction(data: FormData): Promise<RedemptionActionResult> {
  let winId: string;
  try {
    winId = field(data, 'winId');
    const reason = field(data, 'reason');
    const adminId = await requireAdmin();
    await correctRedemption(winId, reason, adminId);
  } catch (error) { return failure(error); }
  try {
    const [win] = await db.select({ classId: winningRecords.classId }).from(winningRecords).where(eq(winningRecords.id, winId));
    if (win) refresh(win.classId);
  } catch {
    // Correction has committed; cache lookup is best effort.
  }
  return { ok: true, message: '已纠正兑换状态' };
}
