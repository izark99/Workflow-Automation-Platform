import { defineConfig } from 'vite';

// Builds only the acceptance page, so the engine runs from a production build in the browser (decision D8).
export default defineConfig({
  build: {
    outDir: 'dist-acceptance',
    emptyOutDir: true,
    rollupOptions: { input: { acceptance: 'acceptance/index.html' } },
  },
});
