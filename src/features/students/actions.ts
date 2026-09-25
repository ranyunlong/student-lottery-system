'use server';

import { revalidatePath } from 'next/cache';
import { requireClassAccess } from '../../lib/access';
import { parsePastedStudents, type ImportPreview } from './parse';
import { importStudents, archiveStudent, restoreStudent } from './service';

export type ImportResult = { ok: boolean; message: string; inserted?: number; updated?: number; errors?: ImportPreview['errors'] };
export type StudentActionResult = { ok: boolean; message: string };

function field(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error('表单数据无效');
  return value;
}

export async function importPastedStudentsAction(data: FormData): Promise<ImportResult> {
  const classId = field(data, 'classId');
  await requireClassAccess(classId);
  try {
    const text = field(data, 'text');
    if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) throw new Error('粘贴内容不能超过 2 MiB');
    const preview = parsePastedStudents(text);
    if (preview.errors.length) return { ok: false, message: '请修正逐行错误后重新预览', errors: preview.errors };
    const counts = await importStudents(classId, preview.rows);
    revalidatePath('/classes/' + classId + '/students');
    return { ok: true, message: '导入完成', ...counts };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '导入失败' };
  }
}

async function changeStudent(data: FormData, change: typeof archiveStudent, message: string): Promise<StudentActionResult> {
  const classId = field(data, 'classId');
  await requireClassAccess(classId);
  try {
    await change(classId, Number(field(data, 'studentId')));
    revalidatePath('/classes/' + classId + '/students');
    return { ok: true, message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '操作失败' };
  }
}

export async function archiveStudentAction(data: FormData): Promise<StudentActionResult> {
  return changeStudent(data, archiveStudent, '学生已归档');
}

export async function restoreStudentAction(data: FormData): Promise<StudentActionResult> {
  return changeStudent(data, restoreStudent, '学生已恢复');
}
