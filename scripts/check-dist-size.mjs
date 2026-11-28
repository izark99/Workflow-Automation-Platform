// Fails when a file in the build output is above the per-file limit of Cloudflare Pages (25 MiB).
// Run by `npm run build:pages`, so a too-large file is found in the build log, not at upload.
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

// The main file of the app must not grow because of ExcelJS (Phase 9): it is a separate file that a print layout loads. The limit is
// the size before ExcelJS (1,929,381 bytes, T9.1) with room for the code of the phase itself (the print settings, the writer, the link rules).
const MAIN_LIMIT = 2_300_000;
try {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const entry = /<script[^>]*src="\/?(assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (entry) {
    const size = statSync(join(root, entry)).size;
    if (size > MAIN_LIMIT) {
      console.error(`The main file ${entry} is ${size} bytes, above ${MAIN_LIMIT}. Did ExcelJS or another library move into it? Load it with a dynamic import.`);
      process.exit(1);
    }
    const preloaded = /exceljs/i.test(html);
    if (preloaded) {
      console.error('index.html loads the ExcelJS file at start. It must be requested only when a print layout is on.');
      process.exit(1);
    }
    console.log(`Main file ${entry}: ${size} bytes (limit ${MAIN_LIMIT}); ExcelJS is not loaded at start.`);
  }
} catch {
  // No index.html (a folder that is not the app build): nothing more to check.
}
console.log(`All files in ${root} are within the 25 MiB limit of Cloudflare Pages.`);
