import { defineConfig } from 'vitest/config';

// The integration test of the Edge Function `admin-users`. It needs the full local stack with the Edge Runtime, so
// `npm run test:functions` starts it and passes the addresses and keys in the environment. Never part of `npm run check`.
export default defineConfig({
  test: {
    include: ['integration-functions/**/*.test.ts'],
    environment: 'node',
    testTimeout: 90_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
