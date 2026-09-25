'use server';

import { requireAdmin } from '../../lib/access';
import { assignTeacher, archiveClass, createClass, createTeacher, disableTeacher, removeTeacher, resetTeacherPassword, updateTeacher, updateClass } from './service';

export type ActionResult = { ok: boolean; message: string };

function field(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error('表单数据无效');
  return value;
}

async function run(action: () => Promise<void>, success: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await action();
    return { ok: true, message: success };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '操作失败，请重试' };
  }
}

export async function createTeacherAction(data: FormData): Promise<ActionResult> {
  return run(async () => { await createTeacher({ name: field(data, 'name'), email: field(data, 'email'), temporaryPassword: field(data, 'temporaryPassword') }); }, '老师账号已创建');
}

export async function updateTeacherAction(data: FormData): Promise<ActionResult> {
  return run(() => updateTeacher(field(data, 'teacherId'), { name: field(data, 'name'), email: field(data, 'email') }), '老师资料已更新');
}

export async function disableTeacherAction(data: FormData): Promise<ActionResult> {
  return run(() => disableTeacher(field(data, 'teacherId')), '老师账号已停用');
}

export async function resetTeacherPasswordAction(data: FormData): Promise<ActionResult> {
  return run(() => resetTeacherPassword(field(data, 'teacherId'), field(data, 'temporaryPassword')), '临时密码已设置，请通知老师修改');
}

export async function createClassAction(data: FormData): Promise<ActionResult> {
  return run(async () => { await createClass(field(data, 'name')); }, '班级已创建');
}

export async function updateClassAction(data: FormData): Promise<ActionResult> {
  return run(() => updateClass(field(data, 'classId'), field(data, 'name')), '班级名称已更新');
}

export async function assignTeacherAction(data: FormData): Promise<ActionResult> {
  return run(() => assignTeacher(field(data, 'classId'), field(data, 'teacherId')), '老师已分配');
}

export async function removeTeacherAction(data: FormData): Promise<ActionResult> {
  return run(() => removeTeacher(field(data, 'classId'), field(data, 'teacherId')), '老师分配已移除');
}

export async function archiveClassAction(data: FormData): Promise<ActionResult> {
  return run(() => archiveClass(field(data, 'classId')), '班级已归档');
}
