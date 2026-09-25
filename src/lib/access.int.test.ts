import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { user } from '../db/auth-schema';
import { classes, classTeachers } from '../db/schema';
import { auth } from './auth';
import { checkClassAccess, requireClassAccess, requireAdmin, requireSession } from './access';
import { createInitialAdmin } from '../../scripts/create-admin';

const teacherId = randomUUID();
const adminId = randomUUID();
const assignedClassId = randomUUID();
const foreignClassId = randomUUID();

beforeAll(async () => {
  await db.insert(user).values([
    { id: teacherId, name: 'Teacher', email: `${teacherId}@example.test`, role: 'user' },
    { id: adminId, name: 'Admin', email: `${adminId}@example.test`, role: 'admin' },
  ]);
  await db.insert(classes).values([{ id: assignedClassId, name: 'Assigned' }, { id: foreignClassId, name: 'Foreign' }]);
  await db.insert(classTeachers).values({ classId: assignedClassId, teacherId });
});
afterAll(async () => { await pool.end(); });

test('teacher cannot access foreign class', async () => {
  await expect(checkClassAccess(teacherId, foreignClassId)).rejects.toThrow('无权访问班级');
});
test('teacher can access assigned class', async () => {
  await expect(checkClassAccess(teacherId, assignedClassId)).resolves.toBeUndefined();
});
test('admin can access foreign class', async () => {
  await expect(checkClassAccess(adminId, foreignClassId)).resolves.toBeUndefined();
});
test('removed assignment immediately revokes access', async () => {
  await db.delete(classTeachers).where(eq(classTeachers.teacherId, teacherId));
  await expect(checkClassAccess(teacherId, assignedClassId)).rejects.toThrow('无权访问班级');
});
test('unknown and disabled accounts cannot access classes', async () => {
  await expect(checkClassAccess(randomUUID(), foreignClassId)).rejects.toThrow();
  await db.update(user).set({ banned: true }).where(eq(user.id, teacherId));
  await expect(checkClassAccess(teacherId, assignedClassId)).rejects.toThrow();
});
test('public signup is denied', async () => {
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${randomUUID()}@example.test`, name: 'Guest', password: 'StrongPassword123!' }),
  }));
  expect(response.ok).toBe(false);
});
test('disabled teacher cannot sign in', async () => {
  const email = `${randomUUID()}@example.test`;
  const created = await auth.api.createUser({ body: { email, name: 'Disabled', password: 'StrongPassword123!', role: 'user' } });
  await db.update(user).set({ banned: true }).where(eq(user.id, created.user.id));
  await expect(auth.api.signInEmail({ body: { email, password: 'StrongPassword123!' } })).rejects.toThrow();
});
test('admin create-user marks a new teacher for password change by default', async () => {
  const email = `${randomUUID()}@example.test`;
  const created = await auth.api.createUser({ body: {
    email, name: 'Teacher without explicit flag', password: 'TemporaryPassword123!', role: 'user',
  } });
  const [stored] = await db.select({ mustChangePassword: user.mustChangePassword }).from(user).where(eq(user.id, created.user.id));
  expect(stored.mustChangePassword).toBe(true);
});
test('admin password reset requires the target teacher to change password', async () => {
  const adminEmail = `${randomUUID()}@example.test`;
  const targetEmail = `${randomUUID()}@example.test`;
  await auth.api.createUser({ body: {
    email: adminEmail, name: 'Password reset admin', password: 'AdminPassword123!', role: 'admin',
  } });
  const target = await auth.api.createUser({ body: {
    email: targetEmail, name: 'Password reset target', password: 'OldPassword123!', role: 'user',
  } });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, target.user.id));
  const signedIn = await auth.api.signInEmail({ body: { email: adminEmail, password: 'AdminPassword123!' }, asResponse: true });
  const cookie = signedIn.headers.get('set-cookie')?.split(';')[0] ?? '';
  const headers = new Headers({ cookie });
  await auth.api.changePassword({ headers, body: { currentPassword: 'AdminPassword123!', newPassword: 'PermanentAdmin123!' } });
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/admin/set-user-password', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: target.user.id, newPassword: 'NewTemporary123!' }),
  }));
  expect(response.status).toBe(200);
  const [stored] = await db.select({ mustChangePassword: user.mustChangePassword }).from(user).where(eq(user.id, target.user.id));
  expect(stored.mustChangePassword).toBe(true);
});
test('first login forces password change', async () => {
  const email = `${randomUUID()}@example.test`;
  const created = await auth.api.createUser({ body: {
    email, name: 'New teacher', password: 'TemporaryPassword123!', role: 'user', data: { mustChangePassword: true },
  } });
  const signedIn = await auth.api.signInEmail({ body: { email, password: 'TemporaryPassword123!' }, asResponse: true });
  expect(signedIn.ok).toBe(true);
  expect((await signedIn.clone().json()).user.mustChangePassword).toBe(true);
  await expect(checkClassAccess(created.user.id, foreignClassId)).rejects.toThrow('请先修改密码');
  const cookie = signedIn.headers.get('set-cookie')?.split(';')[0];
  expect(cookie).toBeTruthy();
  const headers = new Headers({ cookie: cookie ?? '' });
  await expect(auth.api.changePassword({ headers, body: { currentPassword: 'WrongPassword123!', newPassword: 'ChangedPassword123!' } })).rejects.toThrow();
  await expect(checkClassAccess(created.user.id, foreignClassId)).rejects.toThrow('请先修改密码');
  await auth.api.changePassword({ headers, body: { currentPassword: 'TemporaryPassword123!', newPassword: 'ChangedPassword123!' } });
  const [updated] = await db.select().from(user).where(eq(user.id, created.user.id));
  expect(updated.mustChangePassword).toBe(false);
});
test('server entry points reject missing session', async () => {
  await expect(requireSession()).rejects.toThrow();
  await expect(requireAdmin()).rejects.toThrow();
  await expect(requireClassAccess(foreignClassId)).rejects.toThrow();
});
test('bootstrap rejects empty credentials and never resets an existing account', async () => {
  await expect(createInitialAdmin('', 'StrongPassword123!')).rejects.toThrow();
  await expect(createInitialAdmin('admin@example.test', '')).rejects.toThrow();
  const email = `${randomUUID()}@example.test`;
  const first = await createInitialAdmin(email, 'StrongPassword123!');
  expect(first).toBe(true);
  const second = await createInitialAdmin(email, 'DifferentPassword123!');
  expect(second).toBe(false);
  const signedIn = await auth.api.signInEmail({ body: { email, password: 'StrongPassword123!' } });
  expect(signedIn.user.role).toBe('admin');
  await expect(auth.api.signInEmail({ body: { email, password: 'DifferentPassword123!' } })).rejects.toThrow();
});
test('temporary password cannot call administrator endpoints', async () => {
  const email = `${randomUUID()}@example.test`;
  await auth.api.createUser({ body: { email, name: 'Temporary admin', role: 'admin', password: 'TemporaryPassword123!', data: { mustChangePassword: true } } });
  const signedIn = await auth.api.signInEmail({ body: { email, password: 'TemporaryPassword123!' }, asResponse: true });
  const cookie = signedIn.headers.get('set-cookie')?.split(';')[0] ?? '';
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/admin/list-users', { headers: { cookie } }));
  expect(response.status).toBe(403);
});
test('demoted administrator loses API access without a new login', async () => {
  const email = `${randomUUID()}@example.test`;
  const created = await auth.api.createUser({ body: { email, name: 'Former admin', role: 'admin', password: 'StrongPassword123!' } });
  const signedIn = await auth.api.signInEmail({ body: { email, password: 'StrongPassword123!' }, asResponse: true });
  const cookie = signedIn.headers.get('set-cookie')?.split(';')[0] ?? '';
  await db.update(user).set({ role: 'user' }).where(eq(user.id, created.user.id));
  const response = await auth.handler(new Request('http://localhost:3000/api/auth/admin/list-users', { headers: { cookie } }));
  expect(response.status).toBe(403);
});
