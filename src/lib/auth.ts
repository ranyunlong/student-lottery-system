import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { db } from '@/db/client';
import * as authSchema from '@/db/auth-schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  plugins: [admin()],
});
