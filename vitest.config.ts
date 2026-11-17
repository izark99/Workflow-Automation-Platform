import { defineConfig } from 'vitest/config';

// Unit tests live in src/. Playwright specs live in e2e/ and are never picked up here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
