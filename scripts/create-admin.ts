import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { user } from '../src/db/auth-schema';
import { auth } from '../src/lib/auth';

export async function createInitialAdmin(emailInput: string, password: string): Promise<boolean> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password.trim()) throw new Error('ADMIN_EMAIL 和 ADMIN_PASSWORD 均不能为空');
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) return false;
  await auth.api.createUser({ body: { email, name: '管理员', password, role: 'admin', data: { mustChangePassword: true } } });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createInitialAdmin(process.env.ADMIN_EMAIL ?? '', process.env.ADMIN_PASSWORD ?? '')
    .then((created) => console.log(created ? '已创建管理员，请首次登录后修改密码' : '管理员邮箱已存在，未修改现有凭据'))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => pool.end());
}
