import { defineConfig } from '@playwright/test';

// UI rules run on a production build (a dev server reloads the page when its optimizer runs). Three named projects, so a
// log shows each combination on its own: light at 1280 and 1440 px, dark at 1440 px (G4). The theme comes from the
// operating system setting, which the app's default choice (System) follows.
export default defineConfig({
  testDir: 'ui-rules',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4177' },
  projects: [
    { name: 'light-1280', use: { viewport: { width: 1280, height: 900 }, colorScheme: 'light' } },
    { name: 'light-1440', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'dark-1440', use: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_DEV_ROUTES=true npx vite build --outDir dist-ui-rules --emptyOutDir && npx vite preview --outDir dist-ui-rules --port 4177 --strictPort',
    url: 'http://localhost:4177/',
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
