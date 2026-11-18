import { defineConfig } from '@playwright/test';

// Spike specs only. The app config in playwright.config.ts covers e2e/.
export default defineConfig({
  testDir: 'spike',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/bench/',
    reuseExistingServer: true,
  },
});
