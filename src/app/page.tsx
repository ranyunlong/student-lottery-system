import { redirect } from 'next/navigation';
import { requireSession, ForbiddenError } from '../lib/access';

export default async function Page() {
  try {
    const session = await requireSession();
    redirect(session.role === 'admin' ? '/admin/teachers' : '/teacher');
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(error.message === '请先修改密码' ? '/change-password' : '/login');
    throw error;
  }
}
