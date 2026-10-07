import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      AUTH_DEV_BYPASS: 'true',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        process.env.DATABASE_URL?.replace(/\/roomie(\?|$)/, '/roomie_test$1') ??
        'postgresql://roomie:roomie@localhost:5432/roomie_test',
    },
  },
});
