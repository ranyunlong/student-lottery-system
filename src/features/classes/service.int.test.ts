import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { account, user } from '../../db/auth-schema';
import { adminAudit, classes } from '../../db/schema';
import { auth } from '../../lib/auth';
import { requireClassAccess } from '../../lib/access';
import { createTeacher, createClass, assignTeacher, removeTeacher, listClassTeacherIds, archiveClass, updateClass, updateTeacher, disableTeacher, resetTeacherPassword, listTeachers, listClasses, listTeacherClasses, listAdminAudit } from './service';
import { createTeacherAction, createClassAction, assignTeacherAction, removeTeacherAction, archiveClassAction, updateClassAction, updateTeacherAction, disableTeacherAction, resetTeacherPasswordAction } from './actions';

let activeCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: activeCookie }) }));
const adminEmail = `${randomUUID()}@example.test`;
const secondAdminEmail = `${randomUUID()}@example.test`;
const teacherEmail = `${randomUUID()}@example.test`;
let adminId: string;
let secondAdminId: string;
let teacherId: string;
let teacherCookie: string;
let adminCookie: string;
let secondAdminCookie: string;

async function cookieFor(email: string, password: string) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

beforeAll(async () => {
  adminId = (await auth.api.createUser({ body: { email: adminEmail, name: 'Admin', password: 'AdminPassword123!', role: 'admin' } })).user.id;
  secondAdminId = (await auth.api.createUser({ body: { email: secondAdminEmail, name: 'Second Admin', password: 'SecondAdminPassword123!', role: 'admin' } })).user.id;
  teacherId = (await auth.api.createUser({ body: { email: teacherEmail, name: 'Teacher', password: 'TeacherPassword123!', role: 'user' } })).user.id;
  adminCookie = await cookieFor(adminEmail, 'AdminPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: adminCookie }), body: { currentPassword: 'AdminPassword123!', newPassword: 'AdminChanged123!' } });
  secondAdminCookie = await cookieFor(secondAdminEmail, 'SecondAdminPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: secondAdminCookie }), body: { currentPassword: 'SecondAdminPassword123!', newPassword: 'SecondAdminChanged123!' } });
  teacherCookie = await cookieFor(teacherEmail, 'TeacherPassword123!');
  await auth.api.changePassword({ headers: new Headers({ cookie: teacherCookie }), body: { currentPassword: 'TeacherPassword123!', newPassword: 'TeacherChanged123!' } });
  activeCookie = adminCookie;
  await db.execute(sql.raw('CREATE TABLE task4_audit_failure_injection (action text, operation text, PRIMARY KEY (action, operation))'));
  await db.execute(sql.raw('CREATE TABLE task4_account_failure_injection (operation text PRIMARY KEY)'));
  await db.execute(sql.raw(`CREATE FUNCTION task4_reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM task4_audit_failure_injection WHERE action = NEW.action AND operation = TG_OP)
        AND NOT (TG_OP = 'UPDATE' AND NEW.details->>'state' = 'needs_reconciliation') THEN
        RAISE EXCEPTION 'injected admin audit failure for %', NEW.action;
      END IF;
      RETURN NEW;
    END;
  $$`));
  await db.execute(sql.raw('CREATE TRIGGER task4_reject_admin_audit BEFORE INSERT OR UPDATE ON admin_audit FOR EACH ROW EXECUTE FUNCTION task4_reject_admin_audit()'));
  await db.execute(sql.raw(`CREATE FUNCTION task4_reject_account_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM task4_account_failure_injection WHERE operation = TG_OP) THEN
        RAISE EXCEPTION 'injected account credential failure';
      END IF;
      RETURN NEW;
    END;
  $$`));
  await db.execute(sql.raw("CREATE TRIGGER task4_reject_account_insert BEFORE INSERT ON account FOR EACH ROW WHEN (NEW.provider_id = 'credential') EXECUTE FUNCTION task4_reject_account_insert()"));
});
afterAll(async () => {
  await db.execute(sql.raw('DROP TRIGGER task4_reject_account_insert ON account'));
  await db.execute(sql.raw('DROP FUNCTION task4_reject_account_insert()'));
  await db.execute(sql.raw('DROP TABLE task4_account_failure_injection'));
  await db.execute(sql.raw('DROP TRIGGER task4_reject_admin_audit ON admin_audit'));
  await db.execute(sql.raw('DROP FUNCTION task4_reject_admin_audit()'));
  await db.execute(sql.raw('DROP TABLE task4_audit_failure_injection'));
  await pool.end();
});
afterEach(() => { activeCookie = adminCookie; });

async function rejectAuditAction(action: string, operation = 'INSERT') {
  await db.execute(sql`INSERT INTO task4_audit_failure_injection (action, operation) VALUES (${action}, ${operation})`);
}

async function allowAuditAction(action: string, operation?: string) {
  if (operation) await db.execute(sql`DELETE FROM task4_audit_failure_injection WHERE action = ${action} AND operation = ${operation}`);
  else await db.execute(sql`DELETE FROM task4_audit_failure_injection WHERE action = ${action}`);
}

async function rejectCredentialInsert() {
  await db.execute(sql.raw("INSERT INTO task4_account_failure_injection (operation) VALUES ('INSERT')"));
}

async function allowCredentialInsert() {
  await db.execute(sql.raw('DELETE FROM task4_account_failure_injection'));
}

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test('creates teachers and class, changes assignments and audits the authenticated actor', async () => {
  const email = `${randomUUID()}@example.test`;
  const a = await createTeacher({ name: '甲老师', email, temporaryPassword: 'TemporaryPassword123!' });
  const b = await createTeacher({ name: '乙老师', email: `${randomUUID()}@example.test`, temporaryPassword: 'TemporaryPassword123!' });
  const classId = await createClass('  一班  ');
  await assignTeacher(classId, a);
  await assignTeacher(classId, b);
  expect(await listClassTeacherIds(classId)).toEqual([a, b].sort());
  await removeTeacher(classId, a);
  expect(await listClassTeacherIds(classId)).toEqual([b]);
  expect((await db.select().from(user).where(eq(user.id, a)))[0]).toMatchObject({ email, role: 'user', mustChangePassword: true });
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].name).toBe('一班');
  const events = await db.select().from(adminAudit).where(eq(adminAudit.classId, classId)).orderBy(asc(adminAudit.createdAt));
  expect(events.map((e) => e.action)).toEqual(['class.create', 'class.teacher.assign', 'class.teacher.assign', 'class.teacher.remove']);
  expect(events.every((e) => e.actorId === adminId && e.createdAt instanceof Date)).toBe(true);
  const creation = (await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, a)))[0];
  expect(creation.actorId).toBe(adminId);
  expect(JSON.stringify(creation.details)).not.toContain('TemporaryPassword123!');
});

test('rejects blank names, duplicate email, administrator assignment and archived class assignment', async () => {
  await expect(createClass('  ')).rejects.toThrow();
  await expect(createTeacher({ name: '重复', email: teacherEmail, temporaryPassword: 'TemporaryPassword123!' })).rejects.toThrow();
  const classId = await createClass('归档班');
  await expect(assignTeacher(classId, adminId)).rejects.toThrow();
  await archiveClass(classId);
  await expect(assignTeacher(classId, teacherId)).rejects.toThrow();
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].archived).toBe(true);
  expect((await db.select().from(adminAudit).where(eq(adminAudit.classId, classId)).orderBy(asc(adminAudit.createdAt))).map((e) => e.action)).toEqual(['class.create', 'class.archive']);
});

test('updates, disables and resets teacher while retaining class history and audit', async () => {
  const id = await createTeacher({ name: '旧名', email: `${randomUUID()}@example.test`, temporaryPassword: 'TemporaryPassword123!' });
  const classId = await createClass('历史班');
  await assignTeacher(classId, id);
  await updateTeacher(id, { name: '新名', email: `${randomUUID()}@example.test` });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
  await resetTeacherPassword(id, 'ResetPassword123!');
  await disableTeacher(id);
  expect((await db.select().from(user).where(eq(user.id, id)))[0]).toMatchObject({ name: '新名', banned: true, mustChangePassword: true });
  expect(await listClassTeacherIds(classId)).toEqual([id]);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id)).orderBy(asc(adminAudit.createdAt));
  expect(events.map((e) => e.action)).toEqual(['teacher.create', 'class.teacher.assign', 'teacher.update', 'teacher.password.reset', 'teacher.disable']);
  expect(events.every((e) => e.actorId === adminId && e.createdAt instanceof Date)).toBe(true);
  expect(JSON.stringify(events)).not.toContain('ResetPassword123!');
});

test('audit insert failure prevents teacher creation and retry can use the same email', async () => {
  const email = `${randomUUID()}@example.test`;
  await rejectAuditAction('teacher.create');
  try {
    await expect(createTeacher({ name: '审计失败', email, temporaryPassword: 'TemporaryPassword123!' })).rejects.toThrow();
    expect(await db.select({ id: user.id }).from(user).where(eq(user.email, email))).toEqual([]);
  } finally { await allowAuditAction('teacher.create'); }
  const id = await createTeacher({ name: '审计恢复', email, temporaryPassword: 'TemporaryPassword123!' });
  expect((await db.select().from(user).where(eq(user.id, id)))[0].email).toBe(email);
});

test('create retry reconciles an existing account when audit finalization fails', async () => {
  const email = `${randomUUID()}@example.test`;
  const requestId = randomUUID();
  await rejectAuditAction('teacher.create', 'UPDATE');
  try {
    const result = await createTeacherAction(formData({ name: '创建后审计失败', email, temporaryPassword: 'TemporaryPassword123!', requestId }));
    expect(result.ok).toBe(false);
    expect((await db.select({ id: user.id }).from(user).where(eq(user.email, email)))).toHaveLength(1);
    expect((await db.select().from(adminAudit).where(eq(adminAudit.action, 'teacher.create'))).some((event) => {
      const details = event.details as { email?: string; state?: string };
      return details.email === email && details.state === 'needs_reconciliation';
    })).toBe(true);
  } finally { await allowAuditAction('teacher.create', 'UPDATE'); }
  const retry = await createTeacherAction(formData({ name: '创建后审计失败', email, temporaryPassword: 'TemporaryPassword123!', requestId }));
  expect(retry.ok).toBe(true);
  const retriedId = (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;
  expect((await db.select({ id: user.id }).from(user).where(eq(user.email, email)))).toHaveLength(1);
  expect((await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, retriedId))).map((event) => (event.details as { state?: string }).state)).toContain('completed');
});

test('create retry repairs a user row left without a credential by Better Auth failure', async () => {
  const email = `${randomUUID()}@example.test`;
  const requestId = randomUUID();
  await rejectCredentialInsert();
  try {
    const result = await createTeacherAction(formData({ name: '部分创建', email, temporaryPassword: 'TemporaryPassword123!', requestId }));
    expect(result.ok).toBe(false);
    const created = (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0];
    expect(created).toBeTruthy();
    expect(await db.select().from(account).where(eq(account.userId, created.id))).toEqual([]);
  } finally { await allowCredentialInsert(); }
  const retry = await createTeacherAction(formData({ name: '部分创建', email, temporaryPassword: 'TemporaryPassword123!', requestId }));
  expect(retry.ok).toBe(true);
  const retriedId = (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;
  expect(retriedId).toBeTruthy();
  expect(await db.select().from(account).where(eq(account.userId, retriedId))).toHaveLength(1);
  await expect(auth.api.signInEmail({ body: { email, password: 'TemporaryPassword123!' } })).resolves.toBeTruthy();
});

test('audit insert failure prevents teacher disable', async () => {
  const id = (await auth.api.createUser({ body: { email: `${randomUUID()}@example.test`, name: 'Disable target', password: 'OldPassword123!', role: 'user' } })).user.id;
  await rejectAuditAction('teacher.disable');
  try {
    await expect(disableTeacher(id)).rejects.toThrow();
    expect((await db.select({ banned: user.banned }).from(user).where(eq(user.id, id)))[0].banned).toBe(false);
  } finally { await allowAuditAction('teacher.disable'); }
});

test('audit insert failure prevents teacher password reset', async () => {
  const email = `${randomUUID()}@example.test`;
  await auth.api.createUser({ body: { email, name: 'Reset target', password: 'OldPassword123!', role: 'user' } });
  const id = (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
  await rejectAuditAction('teacher.password.reset');
  try {
    await expect(resetTeacherPassword(id, 'NewPassword123!')).rejects.toThrow();
    expect((await db.select({ mustChangePassword: user.mustChangePassword }).from(user).where(eq(user.id, id)))[0].mustChangePassword).toBe(false);
    await expect(auth.api.signInEmail({ body: { email, password: 'OldPassword123!' } })).resolves.toBeTruthy();
  } finally { await allowAuditAction('teacher.password.reset'); }
});

test('new password reset request from another admin has a separate audit after finalization failure', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: 'Two admin reset target', password: 'OldPassword123!', role: 'user' } })).user.id;
  const firstRequestId = randomUUID();
  const secondRequestId = randomUUID();
  const firstRequest = formData({ teacherId: id, temporaryPassword: 'FirstReset123!', requestId: firstRequestId });
  await rejectAuditAction('teacher.password.reset', 'UPDATE');
  try {
    const first = await resetTeacherPasswordAction(firstRequest);
    expect(first.ok).toBe(false);
  } finally { await allowAuditAction('teacher.password.reset', 'UPDATE'); }

  activeCookie = secondAdminCookie;
  const second = await resetTeacherPasswordAction(formData({ teacherId: id, temporaryPassword: 'SecondReset123!', requestId: secondRequestId }));
  expect(second.ok).toBe(true);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id))
    .orderBy(asc(adminAudit.createdAt), asc(adminAudit.id));
  expect(events.filter((event) => event.action === 'teacher.password.reset')).toMatchObject([
    { actorId: adminId, details: { requestId: firstRequestId, state: 'needs_reconciliation' } },
    { actorId: secondAdminId, details: { requestId: secondRequestId, state: 'completed' } },
  ]);
  expect(JSON.stringify(events)).not.toContain('FirstReset123!');
  expect(JSON.stringify(events)).not.toContain('SecondReset123!');
  await expect(auth.api.signInEmail({ body: { email, password: 'SecondReset123!' } })).resolves.toBeTruthy();

  activeCookie = adminCookie;
  const staleRetry = await resetTeacherPasswordAction(firstRequest);
  const firstPasswordWorks = await auth.api.signInEmail({ body: { email, password: 'FirstReset123!' } })
    .then(() => true, () => false);
  const secondPasswordStillWorks = await auth.api.signInEmail({ body: { email, password: 'SecondReset123!' } })
    .then(() => true, () => false);
  const firstAudit = (await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id)))
    .find((event) => event.action === 'teacher.password.reset' && (event.details as { requestId?: string }).requestId === firstRequestId);
  expect({ staleRetryOk: staleRetry.ok, firstPasswordWorks, secondPasswordStillWorks,
    firstAuditState: (firstAudit?.details as { state?: string; reconciliation?: string } | undefined)?.state,
    reconciliation: (firstAudit?.details as { state?: string; reconciliation?: string } | undefined)?.reconciliation,
  }).toEqual({ staleRetryOk: false, firstPasswordWorks: false, secondPasswordStillWorks: true,
    firstAuditState: 'needs_reconciliation', reconciliation: 'manual_review_required' });
});

test('unresolved password reset request is not automatically replayed', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = (await auth.api.createUser({ body: { email, name: 'Same request target', password: 'OldPassword123!', role: 'user' } })).user.id;
  const requestId = randomUUID();
  const request = formData({ teacherId: id, temporaryPassword: 'SameReset123!', requestId });
  await rejectAuditAction('teacher.password.reset', 'UPDATE');
  try {
    const first = await resetTeacherPasswordAction(request);
    expect(first.ok).toBe(false);
  } finally { await allowAuditAction('teacher.password.reset', 'UPDATE'); }

  activeCookie = adminCookie;
  const retry = await resetTeacherPasswordAction(request);
  expect(retry.ok).toBe(false);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id))
    .then((rows) => rows.filter((event) => event.action === 'teacher.password.reset'));
  expect(events).toMatchObject([{ actorId: adminId,
    details: { requestId, state: 'needs_reconciliation', reconciliation: 'manual_review_required' } }]);
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain('SameReset123!');
  await expect(auth.api.signInEmail({ body: { email, password: 'SameReset123!' } })).resolves.toBeTruthy();
});

test('new teacher creation does not reconcile another admin pending create', async () => {
  const email = `${randomUUID()}@example.test`;
  const firstRequestId = randomUUID();
  await rejectAuditAction('teacher.create', 'UPDATE');
  try {
    const first = await createTeacherAction(formData({ name: '待核查创建', email, temporaryPassword: 'FirstCreate123!', requestId: firstRequestId }));
    expect(first.ok).toBe(false);
  } finally { await allowAuditAction('teacher.create', 'UPDATE'); }

  activeCookie = secondAdminCookie;
  const second = await createTeacherAction(formData({ name: '待核查创建', email, temporaryPassword: 'SecondCreate123!', requestId: randomUUID() }));
  expect(second.ok).toBe(false);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.action, 'teacher.create'));
  const matching = events.filter((event) => (event.details as { email?: string }).email === email);
  expect(matching).toMatchObject([{ actorId: adminId, details: { requestId: firstRequestId, state: 'needs_reconciliation' } }]);
  expect(JSON.stringify(matching)).not.toContain('FirstCreate123!');
  expect(JSON.stringify(matching)).not.toContain('SecondCreate123!');
});

test('new teacher disable request from another admin has a separate audit after finalization failure', async () => {
  const id = (await auth.api.createUser({ body: { email: `${randomUUID()}@example.test`, name: 'Two admin disable target', password: 'OldPassword123!', role: 'user' } })).user.id;
  const firstRequestId = randomUUID();
  const secondRequestId = randomUUID();
  await rejectAuditAction('teacher.disable', 'UPDATE');
  try {
    const first = await disableTeacherAction(formData({ teacherId: id, requestId: firstRequestId }));
    expect(first.ok).toBe(false);
  } finally { await allowAuditAction('teacher.disable', 'UPDATE'); }

  activeCookie = secondAdminCookie;
  const second = await disableTeacherAction(formData({ teacherId: id, requestId: secondRequestId }));
  expect(second.ok).toBe(true);
  const events = await db.select().from(adminAudit).where(eq(adminAudit.targetUserId, id))
    .orderBy(asc(adminAudit.createdAt), asc(adminAudit.id));
  expect(events.filter((event) => event.action === 'teacher.disable')).toMatchObject([
    { actorId: adminId, details: { requestId: firstRequestId, state: 'needs_reconciliation' } },
    { actorId: secondAdminId, details: { requestId: secondRequestId, state: 'completed' } },
  ]);
});

test('archived class immediately denies an existing teacher session but preserves admin history access', async () => {
  const classId = await createClass('归档前可访问');
  await assignTeacher(classId, teacherId);
  activeCookie = teacherCookie;
  expect(await requireClassAccess(classId)).toBe(teacherId);
  activeCookie = adminCookie;
  await archiveClass(classId);
  activeCookie = teacherCookie;
  await expect(requireClassAccess(classId)).rejects.toThrow('无权访问班级');
  activeCookie = adminCookie;
  expect(await requireClassAccess(classId)).toBe(adminId);
});

test('removing a teacher immediately revokes their existing session access', async () => {
  const classId = await createClass('移除教师班');
  await assignTeacher(classId, teacherId);
  activeCookie = teacherCookie;
  expect(await requireClassAccess(classId)).toBe(teacherId);
  activeCookie = adminCookie;
  await removeTeacher(classId, teacherId);
  activeCookie = teacherCookie;
  await expect(requireClassAccess(classId)).rejects.toThrow('无权访问班级');
  activeCookie = adminCookie;
});

test('teacher cannot call any administrator service or action including reads', async () => {
  activeCookie = teacherCookie;
  const data = (values: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };
  try {
    const denied = [
      () => createTeacher({ name: 'X', email: `${randomUUID()}@example.test`, temporaryPassword: 'Password123!' }),
      () => createClass('Forbidden'), () => assignTeacher(randomUUID(), teacherId),
      () => removeTeacher(randomUUID(), teacherId), () => listClassTeacherIds(randomUUID()),
      () => archiveClass(randomUUID()), () => updateTeacher(teacherId, { name: 'Changed', email: teacherEmail }),
      () => updateClass(randomUUID(), 'Changed'), () => listAdminAudit(),
      () => disableTeacher(teacherId), () => resetTeacherPassword(teacherId, 'ResetPassword123!'),
      () => listTeachers(), () => listClasses(),
      () => createTeacherAction(data({ name: 'X', email: `${randomUUID()}@example.test`, temporaryPassword: 'Password123!' })),
      () => createClassAction(data({ name: 'Forbidden' })),
      () => assignTeacherAction(data({ classId: randomUUID(), teacherId })),
      () => removeTeacherAction(data({ classId: randomUUID(), teacherId })),
      () => archiveClassAction(data({ classId: randomUUID() })),
      () => updateClassAction(data({ classId: randomUUID(), name: 'Changed' })),
      () => updateTeacherAction(data({ teacherId, name: 'X', email: teacherEmail })),
      () => disableTeacherAction(data({ teacherId })),
      () => resetTeacherPasswordAction(data({ teacherId, temporaryPassword: 'Password123!' })),
    ];
    for (const call of denied) await expect(call()).rejects.toThrow('需要管理员权限');
  } finally { activeCookie = adminCookie; }
  expect((await db.select().from(user).where(eq(user.id, teacherId)))[0]).toMatchObject({ name: 'Teacher', banned: false });
});

test('renames active class with actor audit and rejects edits after archival', async () => {
  const classId = await createClass('旧班名');
  await updateClass(classId, ' 新班名 ');
  expect((await db.select().from(classes).where(eq(classes.id, classId)))[0].name).toBe('新班名');
  const event = (await listAdminAudit()).find((row) => row.classId === classId && row.action === 'class.update');
  expect(event).toMatchObject({ actorId: adminId, classId, details: { name: '新班名' } });
  await archiveClass(classId);
  await expect(updateClass(classId, '再修改')).rejects.toThrow();
});

test('teacher class list contains only active assigned classes', async () => {
  const assigned = await createClass('本班');
  const foreign = await createClass('其他班');
  const archived = await createClass('旧班');
  await assignTeacher(assigned, teacherId);
  await assignTeacher(archived, teacherId);
  await archiveClass(archived);
  activeCookie = teacherCookie;
  try {
    expect(await listTeacherClasses()).toEqual([{ id: assigned, name: '本班' }]);
  } finally { activeCookie = adminCookie; }
  expect(foreign).not.toBe(assigned);
});

test('administrator form action reports success or validation error with real database effects', async () => {
  const valid = new FormData();
  valid.set('name', '表单班');
  expect(await createClassAction(valid)).toEqual({ ok: true, message: '班级已创建' });
  expect((await listClasses()).some((row) => row.name === '表单班')).toBe(true);
  const invalid = new FormData();
  invalid.set('name', '   ');
  expect(await createClassAction(invalid)).toMatchObject({ ok: false });
});
