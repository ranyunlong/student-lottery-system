import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { ForbiddenError, requireSession } from '../../lib/access';

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let role: 'admin' | 'teacher';
  try {
    role = (await requireSession()).role;
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(error.message === '请先修改密码' ? '/change-password' : '/login');
    throw error;
  }
  return <AppShell role={role}>{children}</AppShell>;
}
