import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '../../db/client';
import { account, user } from '../../db/auth-schema';
import { adminAudit, classes, classTeachers } from '../../db/schema';
import { requireAdmin, requireSession, ForbiddenError } from '../../lib/access';
import { auth } from '../../lib/auth';

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能为空`);
  return trimmed;
}

async function teacherOrThrow(id: string) {
  const [teacher] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id)).limit(1);
  if (!teacher || teacher.role !== 'user') throw new Error('老师不存在');
}

type AccountAuditDetails = Record<string, unknown>;

async function findPendingAccountAudit(action: string, target: { email?: string; name?: string; userId?: string }) {
  const conditions = [
    eq(adminAudit.action, action),
    sql`${adminAudit.details}->>'state' in ('pending', 'needs_reconciliation')`,
  ];
  if (target.email) conditions.push(sql`${adminAudit.details}->>'email' = ${target.email}`);
  if (target.name) conditions.push(sql`${adminAudit.details}->>'name' = ${target.name}`);
  if (target.userId) conditions.push(eq(adminAudit.targetUserId, target.userId));
  const [entry] = await db.select({ id: adminAudit.id, details: adminAudit.details })
    .from(adminAudit).where(and(...conditions)).orderBy(desc(adminAudit.createdAt)).limit(1);
  return entry;
}

async function startAccountAudit(actorId: string, action: string, targetUserId: string | null, details: AccountAuditDetails) {
  const [entry] = await db.insert(adminAudit).values({
    actorId, targetUserId, action, details: { ...details, state: 'pending' },
  }).returning({ id: adminAudit.id });
  return entry.id;
}

async function setAccountAuditState(id: string, state: 'pending' | 'completed' | 'needs_reconciliation', details: AccountAuditDetails, targetUserId?: string) {
  const updated = await db.update(adminAudit).set({
    ...(targetUserId ? { targetUserId } : {}),
    details: { ...details, state },
  }).where(eq(adminAudit.id, id)).returning({ id: adminAudit.id });
  if (!updated.length) throw new Error('管理审计记录不存在');
}

async function performAuditedAccountChange<T>(id: string, details: AccountAuditDetails, change: () => Promise<T>, targetUserId?: (result: T) => string) {
  try {
    const result = await change();
    await setAccountAuditState(id, 'completed', details, targetUserId?.(result));
    return result;
  } catch (operationError) {
    try {
      await setAccountAuditState(id, 'needs_reconciliation', details);
    } catch (auditError) {
      throw new AggregateError([operationError, auditError], '账号操作或审计状态写入失败，需核查待处理记录');
    }
    throw operationError;
  }
}

export async function createTeacher(input: { name: string; email: string; temporaryPassword: string }): Promise<string> {
  const actorId = await requireAdmin();
  const name = required(input.name, '姓名');
  const email = required(input.email, '邮箱').toLowerCase();
  const password = required(input.temporaryPassword, '临时密码');
  const action = 'teacher.create';
  const pending = await findPendingAccountAudit(action, { email, name });
  const [existing] = await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
  if (pending && existing) {
    if (existing.role !== 'user') throw new Error('邮箱对应的账号不是老师');
    const details = (pending.details ?? { name, email }) as AccountAuditDetails;
    if (existing.name !== name) throw new Error('该邮箱有待核查的老师创建记录，请先处理该记录');
    const [credential] = await db.select({ id: account.id, password: account.password }).from(account)
      .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential'))).limit(1);
    if (!credential?.password) {
      return performAuditedAccountChange(pending.id, details, async () => {
        await auth.api.setUserPassword({ headers: await headers(), body: { userId: existing.id, newPassword: password } });
        return existing.id;
      }, (id) => id);
    }
    await setAccountAuditState(pending.id, 'completed', details, existing.id);
    return existing.id;
  }
  if (existing) throw new Error('邮箱已存在');
  const details = { name, email };
  const auditId = pending?.id ?? await startAccountAudit(actorId, action, null, details);
  const auditDetails = (pending?.details ?? details) as AccountAuditDetails;
  return performAuditedAccountChange(auditId, auditDetails, async () => {
    const created = await auth.api.createUser({ headers: await headers(), body: { name, email, password, role: 'user' } });
    return created.user.id;
  }, (id) => id);
}

export async function updateTeacher(id: string, input: { name: string; email: string }): Promise<void> {
  const actorId = await requireAdmin();
  const name = required(input.name, '姓名');
  const email = required(input.email, '邮箱').toLowerCase();
  await db.transaction(async (tx) => {
    const [teacher] = await tx.select({ role: user.role }).from(user).where(eq(user.id, id)).for('update');
    if (teacher?.role !== 'user') throw new Error('老师不存在');
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (existing && existing.id !== id) throw new Error('邮箱已存在');
    await tx.update(user).set({ name, email }).where(eq(user.id, id));
    await tx.insert(adminAudit).values({ actorId, targetUserId: id, action: 'teacher.update', details: { name, email } });
  });
}

export async function disableTeacher(id: string): Promise<void> {
  const actorId = await requireAdmin();
  await teacherOrThrow(id);
  const action = 'teacher.disable';
  const pending = await findPendingAccountAudit(action, { userId: id });
  const details = (pending?.details ?? {}) as AccountAuditDetails;
  const auditId = pending?.id ?? await startAccountAudit(actorId, action, id, details);
  await performAuditedAccountChange(auditId, details, async () => {
    await auth.api.banUser({ headers: await headers(), body: { userId: id } });
  });
}

export async function resetTeacherPassword(id: string, temporaryPassword: string): Promise<void> {
  const actorId = await requireAdmin();
  await teacherOrThrow(id);
  const password = required(temporaryPassword, '临时密码');
  const action = 'teacher.password.reset';
  const pending = await findPendingAccountAudit(action, { userId: id });
  const details = (pending?.details ?? {}) as AccountAuditDetails;
  const auditId = pending?.id ?? await startAccountAudit(actorId, action, id, details);
  await performAuditedAccountChange(auditId, details, async () => {
    await auth.api.setUserPassword({ headers: await headers(), body: { userId: id, newPassword: password } });
  });
}

export async function createClass(nameInput: string): Promise<string> {
  const actorId = await requireAdmin();
  const name = required(nameInput, '班级名称');
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(classes).values({ name }).returning({ id: classes.id });
    await tx.insert(adminAudit).values({ actorId, classId: created.id, action: 'class.create', details: { name } });
    return created.id;
  });
}

export async function updateClass(classId: string, nameInput: string): Promise<void> {
  const actorId = await requireAdmin();
  const name = required(nameInput, '班级名称');
  await db.transaction(async (tx) => {
    const updated = await tx.update(classes).set({ name })
      .where(and(eq(classes.id, classId), eq(classes.archived, false))).returning({ id: classes.id });
    if (!updated.length) throw new Error('班级不存在或已归档');
    await tx.insert(adminAudit).values({ actorId, classId, action: 'class.update', details: { name } });
  });
}

export async function assignTeacher(classId: string, teacherId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');
    const [teacher] = await tx.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, teacherId));
    if (teacher?.role !== 'user' || teacher.banned) throw new Error('老师不存在或已停用');
    const inserted = await tx.insert(classTeachers).values({ classId, teacherId }).onConflictDoNothing().returning();
    if (!inserted.length) throw new Error('老师已分配到该班级');
    await tx.insert(adminAudit).values({ actorId, classId, targetUserId: teacherId, action: 'class.teacher.assign' });
  });
}

export async function removeTeacher(classId: string, teacherId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const removed = await tx.delete(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId))).returning();
    if (!removed.length) throw new Error('班级老师分配不存在');
    await tx.insert(adminAudit).values({ actorId, classId, targetUserId: teacherId, action: 'class.teacher.remove' });
  });
}

export async function listClassTeacherIds(classId: string): Promise<string[]> {
  await requireAdmin();
  const rows = await db.select({ teacherId: classTeachers.teacherId }).from(classTeachers)
    .where(eq(classTeachers.classId, classId)).orderBy(asc(classTeachers.teacherId));
  return rows.map((row) => row.teacherId);
}

export async function archiveClass(classId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const archived = await tx.update(classes).set({ archived: true })
      .where(and(eq(classes.id, classId), eq(classes.archived, false))).returning({ id: classes.id });
    if (!archived.length) throw new Error('班级不存在或已归档');
    await tx.insert(adminAudit).values({ actorId, classId, action: 'class.archive' });
  });
}

export async function listTeachers() {
  await requireAdmin();
  return db.select({ id: user.id, name: user.name, email: user.email, banned: user.banned })
    .from(user).where(eq(user.role, 'user')).orderBy(asc(user.name), asc(user.id));
}

export async function listClasses() {
  await requireAdmin();
  return db.select({ id: classes.id, name: classes.name, archived: classes.archived,
    teacherId: classTeachers.teacherId, teacherName: user.name })
    .from(classes).leftJoin(classTeachers, eq(classTeachers.classId, classes.id))
    .leftJoin(user, eq(user.id, classTeachers.teacherId)).orderBy(asc(classes.name), asc(classes.id));
}

export async function listTeacherClasses() {
  const session = await requireSession();
  if (session.role !== 'teacher') throw new ForbiddenError('需要老师权限');
  return db.select({ id: classes.id, name: classes.name }).from(classes)
    .innerJoin(classTeachers, eq(classTeachers.classId, classes.id))
    .where(and(eq(classTeachers.teacherId, session.userId), eq(classes.archived, false)))
    .orderBy(asc(classes.name), asc(classes.id));
}

export async function listAdminAudit() {
  await requireAdmin();
  return db.select({ id: adminAudit.id, actorId: adminAudit.actorId, action: adminAudit.action,
    targetUserId: adminAudit.targetUserId, classId: adminAudit.classId, details: adminAudit.details,
    createdAt: adminAudit.createdAt })
    .from(adminAudit).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id)).limit(50);
}
