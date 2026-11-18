import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode pages` is the build for Cloudflare Pages: DuckDB-WASM is loaded from jsDelivr, because its two wasm files
// are above the 25 MiB per-file limit of Pages (decision D71). Every other build serves them itself (decision D7).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'pages' ? { 'import.meta.env.VITE_DUCKDB_SOURCE': JSON.stringify('cdn') } : {},
}));
