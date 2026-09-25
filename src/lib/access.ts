import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '../db/client';
import { user } from '../db/auth-schema';
import { classes, classTeachers } from '../db/schema';
import { auth } from './auth';

export class ForbiddenError extends Error {
  constructor(message = '无权访问班级') { super(message); this.name = 'ForbiddenError'; }
}

export async function checkClassAccess(userId: string, classId: string): Promise<void> {
  const [identity] = await db.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, userId)).limit(1);
  if (!identity || identity.banned) throw new ForbiddenError('账号不可用');
  if (identity.mustChangePassword) throw new ForbiddenError('请先修改密码');
  const [target] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!target) throw new ForbiddenError();
  if (identity.role === 'admin') return;
  if (identity.role !== 'user') throw new ForbiddenError();
  const [membership] = await db.select({ classId: classTeachers.classId }).from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, userId))).limit(1);
  if (!membership) throw new ForbiddenError();
}

export async function requireSession(): Promise<{ userId: string; role: 'admin' | 'teacher' }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ForbiddenError('请先登录');
  const [identity] = await db.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!identity || identity.banned) throw new ForbiddenError('账号不可用');
  if (identity.mustChangePassword) throw new ForbiddenError('请先修改密码');
  if (identity.role !== 'admin' && identity.role !== 'user') throw new ForbiddenError('账号角色无效');
  return { userId: session.user.id, role: identity.role === 'admin' ? 'admin' : 'teacher' };
}

export async function requireAdmin(): Promise<string> {
  const session = await requireSession();
  if (session.role !== 'admin') throw new ForbiddenError('需要管理员权限');
  return session.userId;
}

export async function requireClassAccess(classId: string): Promise<string> {
  const { userId } = await requireSession();
  await checkClassAccess(userId, classId);
  return userId;
}
