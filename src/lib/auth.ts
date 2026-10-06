import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import * as authSchema from '../db/auth-schema';

export const auth = betterAuth({
  // trustedOrigins: [
  //   "http://localhost:3000",
  //   process.env.BETTER_AUTH_URL ?? (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : undefined),
  // ].filter(Boolean) as string[],
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(newUser) {
          return { data: { ...newUser, mustChangePassword: true } };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (['/change-password', '/sign-out', '/get-session'].includes(ctx.path)) return;
      if (!ctx.path.startsWith('/admin/') && ctx.path !== '/update-user') return;
      const session = await getSessionFromCtx(ctx);
      if (!session) return;
      const [identity] = await db.select({ mustChangePassword: authSchema.user.mustChangePassword, banned: authSchema.user.banned })
        .from(authSchema.user).where(eq(authSchema.user.id, session.user.id)).limit(1);
      if (!identity || identity.banned || identity.mustChangePassword) {
        throw new APIError('FORBIDDEN', { message: '请先修改密码或联系管理员' });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (!returned || isAPIError(returned) || (returned instanceof Response && !returned.ok)) return;
      if (ctx.path === '/change-password' && ctx.context.session) {
        await db.update(authSchema.user).set({ mustChangePassword: false })
          .where(eq(authSchema.user.id, ctx.context.session.user.id));
      }
      if (ctx.path === '/admin/set-user-password' && typeof ctx.body.userId === 'string') {
        await db.update(authSchema.user).set({ mustChangePassword: true })
          .where(eq(authSchema.user.id, ctx.body.userId));
      }
    }),
  },
  plugins: [admin()],
});
