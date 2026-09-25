import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/vitest'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
  },
});
