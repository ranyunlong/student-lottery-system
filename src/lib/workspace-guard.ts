import { redirect } from 'next/navigation';
import { ForbiddenError, requireAdmin, requireSession } from './access';

export async function requireAdminPage(): Promise<void> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect(error.message === '请先修改密码' ? '/change-password'
        : error.message === '需要管理员权限' ? '/teacher' : '/login');
    }
    throw error;
  }
}

export async function requireTeacherPage(): Promise<void> {
  try {
    const session = await requireSession();
    if (session.role !== 'teacher') redirect('/admin/teachers');
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(error.message === '请先修改密码' ? '/change-password' : '/login');
    throw error;
  }
}
