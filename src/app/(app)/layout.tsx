import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { ForbiddenError, requireSession } from '../../lib/access';
import { auth } from '../../lib/auth';

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let access: Awaited<ReturnType<typeof requireSession>>;
  try {
    access = await requireSession();
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(error.message === '请先修改密码' ? '/change-password' : '/login');
    throw error;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.id !== access.userId) redirect('/login');
  return <AppShell role={access.role} name={session.user.name} email={session.user.email}>{children}</AppShell>;
}
