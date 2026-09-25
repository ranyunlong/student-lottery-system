import { defineConfig } from 'vitest/config';

// Integration runs always target the disposable Compose database, never an inherited URL.
process.env.DATABASE_URL = 'postgres://lottery_test:lottery_test_only@127.0.0.1:55432/lottery_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
  },
});
