import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/vitest', './src/test/setup.ts'],
    exclude: ['**/*.int.test.ts', '**/tests/e2e/**', '**/tests/e2e-support/**', '**/node_modules/**', '**/.next/**', '**/.next-e2e/**'],
  },
});
