import { defineConfig } from '@playwright/test';

// UI rules run on a production build (a dev server reloads the page when its optimizer runs) at both widths.
export default defineConfig({
  testDir: 'ui-rules',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4177' },
  projects: [
    { name: '1280', use: { viewport: { width: 1280, height: 900 } } },
    { name: '1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_DEV_ROUTES=true npx vite build --outDir dist-ui-rules --emptyOutDir && npx vite preview --outDir dist-ui-rules --port 4177 --strictPort',
    url: 'http://localhost:4177/',
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
