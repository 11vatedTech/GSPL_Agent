import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts'
    ],
    exclude: ['node_modules', '**/dist'],
  },
});
