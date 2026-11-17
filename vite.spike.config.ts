import { defineConfig } from 'vite';

// Builds only the benchmark page, so the spike measures a production build.
export default defineConfig({
  build: {
    outDir: 'dist-spike',
    emptyOutDir: true,
    rollupOptions: { input: { bench: 'bench/index.html' } },
  },
});
