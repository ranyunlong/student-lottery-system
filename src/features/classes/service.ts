import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQLWrapper } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '../../db/client';
import { account, user } from '../../db/auth-schema';
import { adminAudit, classes, classTeachers, lotteryRounds, lotterySessions } from '../../db/schema';
import { requireAdmin, requireSession, ForbiddenError } from '../../lib/access';
import { auth } from '../../lib/auth';

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能为空`);
  return trimmed;
}

export type PageDirection = 'next' | 'prev';
type PageResult<T> = { items: T[]; nextCursor: string | null; previousCursor: string | null };
type AuditRow = { id: string; actorId: string; action: string; targetUserId: string | null; classId: string | null; details: unknown; createdAt: Date };
const teacherPageSize = 20;
const classPageSize = 20;
const adminAuditPageSize = 25;

function encodeCursor(kind: string, key: Record<string, string>) {
  return Buffer.from(JSON.stringify({ kind, key }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined, kind: string): Record<string, string> | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { kind?: string; key?: Record<string, unknown> };
    if (parsed.kind !== kind || !parsed.key || Object.values(parsed.key).some((value) => typeof value !== 'string')) throw new Error();
    return parsed.key as Record<string, string>;
  } catch {
    throw new Error('分页游标无效');
  }
}

function prefixPattern(value: string) {
  return `${value.trim().toLocaleLowerCase().replace(/[!%_]/g, (character) => `!${character}`)}%`;
}

function prefixMatch(column: SQLWrapper, value: string) {
  return sql`lower(${column}) LIKE ${prefixPattern(value)} ESCAPE '!'`;
}

async function teacherOrThrow(id: string) {
  const [teacher] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id)).limit(1);
  if (!teacher || teacher.role !== 'user') throw new Error('老师不存在');
}

type AccountAuditDetails = Record<string, unknown>;

function accountRequestId(value?: string): string {
  const requestId = value === undefined ? randomUUID() : required(value, '请求编号');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error('请求编号无效');
  }
  return requestId;
}

async function findAccountAudit(actorId: string, action: string, requestId: string) {
  const [entry] = await db.select({ id: adminAudit.id, actorId: adminAudit.actorId,
    targetUserId: adminAudit.targetUserId, details: adminAudit.details })
    .from(adminAudit).where(and(
      eq(adminAudit.actorId, actorId),
      eq(adminAudit.action, action),
      sql`${adminAudit.details}->>'requestId' = ${requestId}`,
    )).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id)).limit(1);
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

export async function createTeacher(input: { name: string; email: string; temporaryPassword: string; requestId?: string }): Promise<string> {
  const actorId = await requireAdmin();
  const name = required(input.name, '姓名');
  const email = required(input.email, '邮箱').toLowerCase();
  const password = required(input.temporaryPassword, '临时密码');
  const requestId = accountRequestId(input.requestId);
  const action = 'teacher.create';
  const requestAudit = await findAccountAudit(actorId, action, requestId);
  const requestDetails = { name, email, requestId };
  const auditDetails = (requestAudit?.details ?? requestDetails) as AccountAuditDetails;
  if (requestAudit && (auditDetails.email !== email || auditDetails.name !== name)) {
    throw new Error('请求编号已用于不同的老师创建请求');
  }
  const [existing] = await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    if (!requestAudit) throw new Error('邮箱已存在');
    if (existing.role !== 'user') throw new Error('邮箱对应的账号不是老师');
    if (existing.name !== name) throw new Error('该邮箱有待核查的老师创建记录，请先处理该记录');
    const [credential] = await db.select({ id: account.id, password: account.password }).from(account)
      .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential'))).limit(1);
    if (!credential?.password) {
      return performAuditedAccountChange(requestAudit.id, auditDetails, async () => {
        await auth.api.setUserPassword({ headers: await headers(), body: { userId: existing.id, newPassword: password } });
        return existing.id;
      }, (id) => id);
    }
    if (auditDetails.state !== 'completed') await setAccountAuditState(requestAudit.id, 'completed', auditDetails, existing.id);
    return existing.id;
  }
  if (auditDetails.state === 'completed') throw new Error('已完成的老师创建请求对应账号不存在');
  const auditId = requestAudit?.id ?? await startAccountAudit(actorId, action, null, requestDetails);
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

export async function disableTeacher(id: string, requestIdInput?: string): Promise<void> {
  const actorId = await requireAdmin();
  await teacherOrThrow(id);
  const action = 'teacher.disable';
  const requestId = accountRequestId(requestIdInput);
  const requestAudit = await findAccountAudit(actorId, action, requestId);
  if (requestAudit && requestAudit.targetUserId !== id) throw new Error('请求编号已用于不同的账号');
  const details = (requestAudit?.details ?? { requestId }) as AccountAuditDetails;
  if (details.state === 'completed') return;
  const auditId = requestAudit?.id ?? await startAccountAudit(actorId, action, id, details);
  await performAuditedAccountChange(auditId, details, async () => {
    await auth.api.banUser({ headers: await headers(), body: { userId: id } });
  });
}

export async function resetTeacherPassword(id: string, temporaryPassword: string, requestIdInput?: string): Promise<void> {
  const actorId = await requireAdmin();
  await teacherOrThrow(id);
  const password = required(temporaryPassword, '临时密码');
  const action = 'teacher.password.reset';
  const requestId = accountRequestId(requestIdInput);
  const requestAudit = await findAccountAudit(actorId, action, requestId);
  if (requestAudit && requestAudit.targetUserId !== id) throw new Error('请求编号已用于不同的账号');
  if (requestAudit) {
    const details = (requestAudit.details ?? { requestId }) as AccountAuditDetails;
    if (details.state === 'completed') return;
    await setAccountAuditState(requestAudit.id, 'needs_reconciliation', {
      ...details,
      reconciliation: 'manual_review_required',
    });
    throw new Error('密码重置请求结果不确定，已拒绝自动重试，请人工核对审计记录');
  }
  const details = { requestId };
  const auditId = await startAccountAudit(actorId, action, id, details);
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

export async function updateClassConfiguration(classId: string, input: {
  name: string; primaryTeacherId: string | null; teachingTeacherIds: string[];
}): Promise<void> {
  const actorId = await requireAdmin();
  const name = required(input.name, '班级名称');
  const primaryTeacherId = input.primaryTeacherId?.trim() || null;
  const teachingTeacherIds = input.teachingTeacherIds.map((id) => required(id, '老师编号'));
  const requestedIds = [ ...(primaryTeacherId ? [primaryTeacherId] : []), ...teachingTeacherIds ];
  if (new Set(requestedIds).size !== requestedIds.length) throw new Error('老师分配重复');

  await db.transaction(async (tx) => {
    const [target] = await tx.select({ name: classes.name, archived: classes.archived }).from(classes)
      .where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');

    const current = await tx.select({ teacherId: classTeachers.teacherId, role: classTeachers.role })
      .from(classTeachers).where(eq(classTeachers.classId, classId)).for('update');
    const currentById = new Map(current.map((item) => [item.teacherId, item.role]));
    if (requestedIds.length) {
      const available = await tx.select({ id: user.id, role: user.role, banned: user.banned }).from(user)
        .where(inArray(user.id, requestedIds));
      const availableById = new Map(available.map((teacher) => [teacher.id, teacher]));
      for (const teacherId of requestedIds) {
        const teacher = availableById.get(teacherId);
        const nextRole = teacherId === primaryTeacherId ? 'primary' : 'teaching';
        if (teacher?.role !== 'user' || (teacher.banned && currentById.get(teacherId) !== nextRole)) {
          throw new Error('老师不存在或已停用');
        }
      }
    }

    const nextById = new Map<string, 'primary' | 'teaching'>([
      ...(primaryTeacherId ? [[primaryTeacherId, 'primary'] as const] : []),
      ...teachingTeacherIds.map((id) => [id, 'teaching'] as const),
    ]);
    const changed = target.name !== name || current.length !== nextById.size
      || current.some((item) => nextById.get(item.teacherId) !== item.role);
    if (!changed) return;

    await tx.update(classes).set({ name }).where(eq(classes.id, classId));
    for (const item of current) {
      if (!nextById.has(item.teacherId)) {
        await tx.delete(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, item.teacherId)));
      }
    }
    if (primaryTeacherId && currentById.get(primaryTeacherId) !== 'primary') {
      await tx.update(classTeachers).set({ role: 'teaching' })
        .where(and(eq(classTeachers.classId, classId), eq(classTeachers.role, 'primary')));
    }
    for (const item of current) {
      const nextRole = nextById.get(item.teacherId);
      if (nextRole && nextRole !== 'primary' && nextRole !== item.role) {
        await tx.update(classTeachers).set({ role: nextRole })
          .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, item.teacherId)));
      }
    }
    if (primaryTeacherId && currentById.has(primaryTeacherId) && currentById.get(primaryTeacherId) !== 'primary') {
      await tx.update(classTeachers).set({ role: 'primary' })
        .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, primaryTeacherId)));
    }
    for (const [teacherId, role] of nextById) {
      if (!currentById.has(teacherId)) await tx.insert(classTeachers).values({ classId, teacherId, role });
    }
    await tx.insert(adminAudit).values({ actorId, classId, action: 'class.update', details: {
      name, previousName: target.name,
      previousAssignments: current.map(({ teacherId, role }) => ({ teacherId, role })),
      assignments: [...nextById].map(([teacherId, role]) => ({ teacherId, role })),
    } });
  });
}

export async function assignTeacher(classId: string, teacherId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');
    const [teacher] = await tx.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, teacherId));
    if (teacher?.role !== 'user' || teacher.banned) throw new Error('老师不存在或已停用');
    const inserted = await tx.insert(classTeachers).values({ classId, teacherId, role: 'teaching' }).onConflictDoNothing().returning();
    if (!inserted.length) throw new Error('老师已分配到该班级');
    await tx.insert(adminAudit).values({ actorId, classId, targetUserId: teacherId, action: 'class.teacher.assign' });
  });
}

export async function setPrimaryTeacher(classId: string, teacherId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ archived: classes.archived }).from(classes)
      .where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');
    const [teacher] = await tx.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, teacherId));
    if (teacher?.role !== 'user' || teacher.banned) throw new Error('老师不存在或已停用');

    const [current] = await tx.select({ teacherId: classTeachers.teacherId }).from(classTeachers)
      .where(and(eq(classTeachers.classId, classId), eq(classTeachers.role, 'primary'))).limit(1);
    if (current?.teacherId === teacherId) return;
    await tx.update(classTeachers).set({ role: 'teaching' })
      .where(and(eq(classTeachers.classId, classId), eq(classTeachers.role, 'primary')));
    await tx.insert(classTeachers).values({ classId, teacherId, role: 'primary' })
      .onConflictDoUpdate({ target: [classTeachers.classId, classTeachers.teacherId], set: { role: 'primary' } });
    await tx.insert(adminAudit).values({ actorId, classId, targetUserId: teacherId,
      action: 'class.teacher.primary.set', details: { previousTeacherId: current?.teacherId ?? null, teacherId } });
  });
}

export async function removeTeacher(classId: string, teacherId: string): Promise<void> {
  const actorId = await requireAdmin();
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).for('update');
    if (!target) throw new Error('班级不存在');
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
    const [target] = await tx.select({ archived: classes.archived }).from(classes)
      .where(eq(classes.id, classId)).for('update');
    if (!target || target.archived) throw new Error('班级不存在或已归档');
    const [activeSession] = await tx.select({ id: lotterySessions.id }).from(lotterySessions)
      .where(and(eq(lotterySessions.classId, classId), eq(lotterySessions.status, 'active'))).limit(1);
    if (activeSession) throw new Error('班级存在进行中的场次，请先完成场次后再归档');
    const [activeRound] = await tx.select({ id: lotteryRounds.id }).from(lotteryRounds)
      .where(and(eq(lotteryRounds.classId, classId), eq(lotteryRounds.status, 'active'))).limit(1);
    if (activeRound) throw new Error('班级存在进行中的轮次，请先完成或取消轮次后再归档');
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

export type TeacherPageItem = { id: string; name: string; email: string; banned: boolean; createdAt: Date };
export async function listTeachersPage(input: {
  cursor?: string; direction?: PageDirection; search?: string; status?: 'all' | 'active' | 'disabled';
}): Promise<PageResult<TeacherPageItem>> {
  await requireAdmin();
  const direction = input.direction ?? 'next';
  const key = decodeCursor(input.cursor, 'teachers');
  if (key && (typeof key.createdAt !== 'string' || Number.isNaN(Date.parse(key.createdAt)) || typeof key.id !== 'string')) throw new Error('分页游标无效');
  const predicates = [eq(user.role, 'user')];
  if (input.status === 'active') predicates.push(or(eq(user.banned, false), isNull(user.banned))!);
  if (input.status === 'disabled') predicates.push(eq(user.banned, true));
  const search = input.search?.trim();
  if (search) predicates.push(or(prefixMatch(user.name, search), prefixMatch(user.email, search))!);
  if (key) predicates.push(direction === 'next'
    ? or(sql`${user.createdAt} < ${key.createdAt}::timestamp`, and(eq(user.createdAt, sql`${key.createdAt}::timestamp`), lt(user.id, key.id)))!
    : or(sql`${user.createdAt} > ${key.createdAt}::timestamp`, and(eq(user.createdAt, sql`${key.createdAt}::timestamp`), gt(user.id, key.id)))!);
  let rows = await db.select({ id: user.id, name: user.name, email: user.email, banned: sql<boolean>`coalesce(${user.banned}, false)`,
    createdAt: user.createdAt, createdAtCursor: sql<string>`${user.createdAt}::text` })
    .from(user).where(and(...predicates)).orderBy(direction === 'prev' ? asc(user.createdAt) : desc(user.createdAt),
      direction === 'prev' ? asc(user.id) : desc(user.id)).limit(teacherPageSize + 1);
  const hasMore = rows.length > teacherPageSize;
  rows = rows.slice(0, teacherPageSize);
  if (direction === 'prev') rows.reverse();
  const first = rows[0], last = rows.at(-1);
  return { items: rows.map((row) => ({ id: row.id, name: row.name, email: row.email, banned: row.banned, createdAt: row.createdAt })),
    nextCursor: last && (direction === 'prev' ? Boolean(key) : hasMore) ? encodeCursor('teachers', { createdAt: last.createdAtCursor, id: last.id }) : null,
    previousCursor: first && (direction === 'prev' ? hasMore : Boolean(key)) ? encodeCursor('teachers', { createdAt: first.createdAtCursor, id: first.id }) : null };
}

export async function listClasses() {
  await requireAdmin();
  return db.select({ id: classes.id, name: classes.name, archived: classes.archived, emblemPath: classes.emblemPath,
    teacherId: classTeachers.teacherId, teacherName: user.name })
    .from(classes).leftJoin(classTeachers, eq(classTeachers.classId, classes.id))
    .leftJoin(user, eq(user.id, classTeachers.teacherId)).orderBy(asc(classes.name), asc(classes.id));
}

export type ClassPageItem = { id: string; name: string; archived: boolean; emblemPath: string | null; createdAt: Date; members: { id: string; name: string; role: 'primary' | 'teaching' }[] };
export async function listClassesPage(input: {
  cursor?: string; direction?: PageDirection; search?: string; status?: 'all' | 'active' | 'archived';
}): Promise<PageResult<ClassPageItem>> {
  await requireAdmin();
  const direction = input.direction ?? 'next';
  const key = decodeCursor(input.cursor, 'classes');
  if (key && (typeof key.createdAt !== 'string' || Number.isNaN(Date.parse(key.createdAt)) || typeof key.id !== 'string')) throw new Error('分页游标无效');
  const predicates = [];
  if (input.status === 'active') predicates.push(eq(classes.archived, false));
  if (input.status === 'archived') predicates.push(eq(classes.archived, true));
  const search = input.search?.trim();
  if (search) predicates.push(prefixMatch(classes.name, search));
  if (key) predicates.push(direction === 'next'
    ? or(sql`${classes.createdAt} < ${key.createdAt}::timestamptz`, and(eq(classes.createdAt, sql`${key.createdAt}::timestamptz`), lt(classes.id, key.id)))!
    : or(sql`${classes.createdAt} > ${key.createdAt}::timestamptz`, and(eq(classes.createdAt, sql`${key.createdAt}::timestamptz`), gt(classes.id, key.id)))!);
  let page = await db.select({ id: classes.id, name: classes.name, archived: classes.archived, emblemPath: classes.emblemPath,
    createdAt: classes.createdAt, createdAtCursor: sql<string>`${classes.createdAt}::text` })
    .from(classes).where(predicates.length ? and(...predicates) : undefined)
    .orderBy(direction === 'prev' ? asc(classes.createdAt) : desc(classes.createdAt), direction === 'prev' ? asc(classes.id) : desc(classes.id))
    .limit(classPageSize + 1);
  const hasMore = page.length > classPageSize;
  page = page.slice(0, classPageSize);
  if (direction === 'prev') page.reverse();
  const ids = page.map((row) => row.id);
  const assignments = ids.length ? await db.select({ classId: classTeachers.classId, id: user.id, name: user.name, role: classTeachers.role })
    .from(classTeachers).innerJoin(user, eq(user.id, classTeachers.teacherId)).where(inArray(classTeachers.classId, ids))
    .orderBy(asc(user.name), asc(user.id)) : [];
  const membersByClass = new Map<string, { id: string; name: string; role: 'primary' | 'teaching' }[]>();
  for (const assignment of assignments) membersByClass.set(assignment.classId,
    [...(membersByClass.get(assignment.classId) ?? []), { id: assignment.id, name: assignment.name, role: assignment.role as 'primary' | 'teaching' }]);
  const first = page[0], last = page.at(-1);
  return { items: page.map((row) => ({ id: row.id, name: row.name, archived: row.archived, emblemPath: row.emblemPath,
    createdAt: row.createdAt, members: membersByClass.get(row.id) ?? [] })),
    nextCursor: last && (direction === 'prev' ? Boolean(key) : hasMore) ? encodeCursor('classes', { createdAt: last.createdAtCursor, id: last.id }) : null,
    previousCursor: first && (direction === 'prev' ? hasMore : Boolean(key)) ? encodeCursor('classes', { createdAt: first.createdAtCursor, id: first.id }) : null };
}

export type TeacherSearchItem = { id: string; name: string; email: string; banned: boolean };
export async function searchAssignableTeachers(classId: string, search: string): Promise<TeacherSearchItem[]> {
  await requireAdmin();
  const prefix = search.trim();
  if (!prefix) return [];
  const [target] = await db.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!target || target.archived) throw new Error('班级不存在或已归档');
  return db.select({ id: user.id, name: user.name, email: user.email, banned: sql<boolean>`coalesce(${user.banned}, false)` }).from(user)
    .where(and(eq(user.role, 'user'), or(eq(user.banned, false), isNull(user.banned)),
      sql`(${prefixMatch(user.name, prefix)} OR ${prefixMatch(user.email, prefix)})`,
      sql`NOT EXISTS (SELECT 1 FROM class_teachers WHERE class_id = ${classId}::uuid AND teacher_id = ${user.id})`))
    .orderBy(asc(user.name), asc(user.id)).limit(10);
}

export async function searchPrimaryTeacherCandidates(classId: string, search: string): Promise<TeacherSearchItem[]> {
  await requireAdmin();
  const prefix = search.trim();
  if (!prefix) return [];
  const [target] = await db.select({ archived: classes.archived }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!target || target.archived) throw new Error('班级不存在或已归档');
  return db.select({ id: user.id, name: user.name, email: user.email,
    banned: sql<boolean>`coalesce(${user.banned}, false)` }).from(user)
    .where(and(eq(user.role, 'user'), or(eq(user.banned, false), isNull(user.banned)),
      or(prefixMatch(user.name, prefix), prefixMatch(user.email, prefix))!))
    .orderBy(asc(user.name), asc(user.id)).limit(10);
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
  const adminId = await requireAdmin();
  return db.transaction(async (tx) => {
    const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
      .from(user).where(eq(user.id, adminId)).for('share');
    if (!identity || identity.banned || identity.mustChangePassword || identity.role !== 'admin') {
      throw new ForbiddenError('需要管理员权限');
    }
    return tx.select({ id: adminAudit.id, actorId: adminAudit.actorId, action: adminAudit.action,
      targetUserId: adminAudit.targetUserId, classId: adminAudit.classId, details: adminAudit.details,
      createdAt: adminAudit.createdAt })
      .from(adminAudit).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id)).limit(50);
  });
}

async function checkAdminRead(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], adminId: string) {
  const [identity] = await tx.select({ role: user.role, banned: user.banned, mustChangePassword: user.mustChangePassword })
    .from(user).where(eq(user.id, adminId)).for('share');
  if (!identity || identity.banned || identity.mustChangePassword || identity.role !== 'admin') {
    throw new ForbiddenError('需要管理员权限');
  }
}

function auditProjection() {
  return { id: adminAudit.id, actorId: adminAudit.actorId, action: adminAudit.action,
    targetUserId: adminAudit.targetUserId, classId: adminAudit.classId, details: adminAudit.details,
    createdAt: adminAudit.createdAt };
}

export async function listAdminAuditPage(input: { cursor?: string; direction?: PageDirection }): Promise<PageResult<AuditRow>> {
  const adminId = await requireAdmin();
  const direction = input.direction ?? 'next';
  return db.transaction(async (tx) => {
    await checkAdminRead(tx, adminId);
    let boundary: { id: string; createdAtText: string } | undefined;
    if (input.cursor !== undefined) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cursor)) throw new Error('审计游标无效');
      [boundary] = await tx.select({ id: adminAudit.id, createdAtText: sql<string>`${adminAudit.createdAt}::text` })
        .from(adminAudit).where(eq(adminAudit.id, input.cursor));
      if (!boundary) throw new Error('审计游标无效');
    }
    const comparator = direction === 'next' ? lt : gt;
    const rows = await tx.select(auditProjection()).from(adminAudit)
      .where(boundary ? or(direction === 'next'
        ? sql`${adminAudit.createdAt} < ${boundary.createdAtText}::timestamptz`
        : sql`${adminAudit.createdAt} > ${boundary.createdAtText}::timestamptz`,
        and(eq(adminAudit.createdAt, sql`${boundary.createdAtText}::timestamptz`), comparator(adminAudit.id, boundary.id))) : undefined)
      .orderBy(direction === 'prev' ? asc(adminAudit.createdAt) : desc(adminAudit.createdAt),
        direction === 'prev' ? asc(adminAudit.id) : desc(adminAudit.id)).limit(adminAuditPageSize + 1);
    const hasMore = rows.length > adminAuditPageSize;
    let items = rows.slice(0, adminAuditPageSize);
    if (direction === 'prev') items = items.reverse();
    const first = items[0], last = items.at(-1);
    return { items, nextCursor: last && (direction === 'prev' ? Boolean(boundary) : hasMore) ? last.id : null,
      previousCursor: first && (direction === 'prev' ? hasMore : Boolean(boundary)) ? first.id : null };
  });
}

export async function listRecentAdminAudit(): Promise<AuditRow[]> {
  const adminId = await requireAdmin();
  return db.transaction(async (tx) => {
    await checkAdminRead(tx, adminId);
    return tx.select(auditProjection()).from(adminAudit).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id)).limit(5);
  });
}
