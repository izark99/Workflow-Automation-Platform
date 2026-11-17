import { defineConfig } from '@playwright/test';

// The bundled Chromium in /opt/pw-browsers matches this Playwright version.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
