import { defineConfig } from '@playwright/test';

// The UI review of SPEC 11.6 (T4.10a): a screenshot and a few measurements of every route of the UI rules, in both themes at
// 1440 px. It is not a gate. It serves the build that the UI rules made (`npm run test:ui-rules` leaves dist-ui-rules), so
// run that first. Output goes to the folder in UI_AUDIT_DIR.
export default defineConfig({
  testDir: 'ui-audit',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4178' },
  projects: [
    { name: 'light', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'dark', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'npx vite preview --outDir dist-ui-rules --port 4178 --strictPort',
    url: 'http://localhost:4178/',
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
