import { defineConfig } from '@playwright/test';

// Acceptance specs run the engine in Chromium. The time zone is UTC+7 on purpose: a date that moves by one day in
// another time zone must fail here.
export default defineConfig({
  testDir: 'acceptance',
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:4176', timezoneId: 'Asia/Ho_Chi_Minh' },
  webServer: {
    command: 'npx vite build -c vite.acceptance.config.ts && npx vite preview -c vite.acceptance.config.ts --port 4176 --strictPort',
    url: 'http://localhost:4176/acceptance/index.html',
    timeout: 240_000,
    reuseExistingServer: true,
  },
});
