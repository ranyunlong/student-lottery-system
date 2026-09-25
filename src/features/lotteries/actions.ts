'use server';

import { revalidatePath } from 'next/cache';
import { requireClassAccess } from '../../lib/access';
import { activateSession, completeSession, createSession, getSession, updateDraftSession } from './sessions';
import type { SessionConfig } from './types';

export type SessionActionResult = { ok: boolean; message: string };

function field(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error('表单数据无效');
  return value;
}

function integer(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error('数量必须是正整数');
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error('数量必须是正整数');
  return value;
}

function parse(data: FormData): SessionConfig {
  const studentIds = data.getAll('studentIds').map((item) => integer(String(item)));
  const mode = field(data, 'mode');
  if (mode === 'prize-student') return { mode, studentIds, prizeId: field(data, 'prizeId'), roundCount: integer(field(data, 'roundCount')) };
  if (mode === 'student-prize') {
    const prizeIds = data.getAll('prizeIds').map(String);
    return { mode, studentIds, perStudentLimit: integer(field(data, 'perStudentLimit')),
      prizes: prizeIds.map((prizeId) => ({ prizeId, quantity: integer(field(data, 'quantity:' + prizeId)) })) };
  }
  throw new Error('抽奖模式无效');
}

async function run(classId: string, operation: () => Promise<void>, message: string): Promise<SessionActionResult> {
  await requireClassAccess(classId);
  try {
    await operation();
    revalidatePath('/classes/' + classId + '/lotteries');
    return { ok: true, message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '操作失败' };
  }
}

export async function saveSessionAction(data: FormData): Promise<SessionActionResult> {
  const classId = field(data, 'classId');
  return run(classId, async () => {
    const sessionId = data.get('sessionId');
    if (sessionId) await updateDraftSession(String(sessionId), parse(data));
    else await createSession(classId, parse(data));
  }, '草稿已保存');
}

async function transition(data: FormData, operation: typeof activateSession, message: string) {
  const session = await getSession(field(data, 'sessionId'));
  return run(session.classId, () => operation(session.id), message);
}

export async function activateSessionAction(data: FormData): Promise<SessionActionResult> {
  return transition(data, activateSession, '场次已开始');
}

export async function completeSessionAction(data: FormData): Promise<SessionActionResult> {
  return transition(data, completeSession, '场次已结束');
}
