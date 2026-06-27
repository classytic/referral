import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          testTimeout: 10_000,
          hookTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Vitest 4: replaces `poolOptions.forks.singleFork`. Integration
          // files share the default mongoose connection, so they must run
          // sequentially in one worker (no cross-file connection races).
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'scenarios',
          include: ['tests/scenarios/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
