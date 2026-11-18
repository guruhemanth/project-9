import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    isolate: false,
    globalSetup: ['./harness/global-setup.ts'],
    setupFiles: ['./harness/env-setup.ts'],
    include: [
      'tier*/**/*.test.ts',
    ],
  },
});
