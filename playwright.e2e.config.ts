import { defineConfig } from '@playwright/test';

// Journeys run in Chromium at 1440 x 900 on a production build (a dev server reloads when its optimizer runs).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4178', viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Ho_Chi_Minh' },
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_DEV_ROUTES=true VITE_PERF_COUNTERS=true npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 4178 --strictPort',
    url: 'http://localhost:4178/',
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
