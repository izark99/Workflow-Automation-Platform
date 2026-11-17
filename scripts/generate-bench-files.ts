// Writes the six benchmark files of SPEC section 8 into bench-data/ (git-ignored).
// Usage: node scripts/generate-bench-files.ts [outDir] [--only=name,name] [--force]
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { benchFileSpecs, writeCsv, writeXlsx } from './lib/bench-data.ts';

export async function generateBenchFiles(outDir: string, only?: string[], force = false): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const paths: string[] = [];
  for (const spec of benchFileSpecs()) {
    if (only && !only.includes(spec.name)) continue;
    const path = join(outDir, spec.name);
    paths.push(path);
    const exists = await stat(path).then(() => true, () => false);
    if (exists && !force) continue;
    const t0 = Date.now();
    if (spec.format === 'csv') await writeCsv(path, spec.totalRows);
    else await writeXlsx(path, spec.totalRows);
    const { size } = await stat(path);
    console.log(`wrote ${spec.name} (${(size / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  return paths;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const outDir = args.find((a) => !a.startsWith('--')) ?? 'bench-data';
  await generateBenchFiles(outDir, only, args.includes('--force'));
}
