'use server';

import { revalidatePath } from 'next/cache';
import { requireClassAccess } from '../../lib/access';
import { archivePrize, createPrize, adjustStock } from './service';

export type PrizeActionResult = { ok: boolean; message: string };

function field(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error('表单数据无效');
  return value;
}

function integer(data: FormData, name: string): number {
  const raw = field(data, name).trim();
  if (!/^-?\d+$/.test(raw)) throw new Error('库存数量必须是整数');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error('库存数量必须是有效整数');
  return parsed;
}

async function run(data: FormData, operation: (classId: string, actorId: string) => Promise<void>, success: string): Promise<PrizeActionResult> {
  const classId = field(data, 'classId');
  const actorId = await requireClassAccess(classId);
  try {
    await operation(classId, actorId);
    revalidatePath('/classes/' + classId + '/prizes');
    return { ok: true, message: success };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '操作失败' };
  }
}

export async function createPrizeAction(data: FormData): Promise<PrizeActionResult> {
  return run(data, async (classId, actorId) => {
    await createPrize(classId, field(data, 'name'), integer(data, 'openingStock'), actorId);
  }, '奖品已创建');
}

export async function adjustStockAction(data: FormData): Promise<PrizeActionResult> {
  return run(data, async (classId, actorId) => {
    await adjustStock(classId, field(data, 'prizeId'), integer(data, 'delta'), field(data, 'reason'), actorId);
  }, '库存已调整');
}

export async function archivePrizeAction(data: FormData): Promise<PrizeActionResult> {
  return run(data, async (classId) => {
    await archivePrize(classId, field(data, 'prizeId'));
  }, '奖品已归档');
}
