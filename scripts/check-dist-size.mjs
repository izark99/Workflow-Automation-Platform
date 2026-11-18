// Fails when a file in the build output is above the per-file limit of Cloudflare Pages (25 MiB).
// Run by `npm run build:pages`, so a too-large file is found in the build log, not at upload.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 25 * 1024 * 1024;
const root = process.argv[2] ?? 'dist';

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(p);
    else yield p;
  }
}

const tooLarge = [...files(root)].map((p) => [p, statSync(p).size]).filter(([, size]) => size > LIMIT);
if (tooLarge.length > 0) {
  for (const [p, size] of tooLarge) console.error(`${p} is ${(size / 1024 / 1024).toFixed(1)} MiB, above the 25 MiB limit of Cloudflare Pages.`);
  console.error('Build with `npm run build:pages`, which loads DuckDB-WASM from jsDelivr (docs/DEPLOY.md).');
  process.exit(1);
}
console.log(`All files in ${root} are within the 25 MiB limit of Cloudflare Pages.`);
