import { defineConfig } from 'vitest/config';

// The integration test of SupabaseStore. It needs the full local stack, so `npm run test:store` starts it
// and passes the addresses and keys in the environment. Never part of `npm run check`.
export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
