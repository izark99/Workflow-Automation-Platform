// `npm run spike`: runs the benchmark of SPEC section 8 in headless Chromium.
// Usage: npm run spike -- [--sizes=100000,500000] [--timeout-min=8] [--keep-files]
// A crash, an error or a timeout of one run is a result, not a failure of the script.
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { build, preview } from 'vite';
import { generateBenchFiles } from './generate-bench-files.ts';
import { startMemorySampler } from './lib/proc-memory.ts';
import { renderSpikeReport } from './lib/spike-report.ts';
import { classifyOutcome, parseArgs, planRuns, type PlannedRun, type RawResults, type RunRecord } from './lib/spike-runner.ts';

const DATA_DIR = 'bench-data';
const RAW_RESULTS = 'docs/spike-raw.json';
const REPORT = 'docs/SPIKE_RESULTS.md';
const PORT = 4173;

async function runOne(run: PlannedRun, timeoutMs: number): Promise<RunRecord> {
  const path = join(DATA_DIR, run.name);
  const fileMb = Math.round((await stat(path)).size / 1e6);
  // A fresh browser per run: a crash cannot affect the next run and the memory peak is its own.
  const browser = await chromium.launch();
  const started = Date.now();
  let crashed = false;
  let peakRssMb: number;
  let response: Record<string, unknown> | undefined;
  let timedOut = false;
  let stopSampler: (() => Promise<number>) | undefined;
  try {
    const page: Page = await (await browser.newContext()).newPage();
    page.on('crash', () => {
      crashed = true;
    });
    stopSampler = startMemorySampler(await browser.newBrowserCDPSession()).stop;
    await page.goto(`http://localhost:${PORT}/bench/`);
    await page.locator('#file').setInputFiles(path);
    await page.locator('#strategy').selectOption(run.strategy);
    await page.locator('#run').click();
    try {
      await page.waitForFunction(() => document.getElementById('result')?.textContent?.includes('"strategy"'), null, {
        timeout: timeoutMs,
      });
      response = JSON.parse((await page.locator('#result').textContent()) ?? '{}') as Record<string, unknown>;
    } catch (e) {
      if (/crash/i.test(String(e))) crashed = true;
      else timedOut = true;
    }
  } finally {
    peakRssMb = (await stopSampler?.()) ?? 0;
    await browser.close().catch(() => undefined);
  }
  const status = classifyOutcome({ crashed, timedOut, response: response as { ok: boolean } | undefined });
  const rows = typeof response?.rows === 'number' ? response.rows : undefined;
  return {
    file: run.name,
    format: run.format,
    totalRows: run.totalRows,
    fileMb,
    strategy: run.strategy,
    status,
    loadMs: typeof response?.loadMs === 'number' ? Math.round(response.loadMs) : undefined,
    queryMs: typeof response?.queryMs === 'number' ? Math.round(response.queryMs) : undefined,
    wallMs: Date.now() - started,
    peakRssMb,
    rows,
    rowsMatch: rows === undefined ? undefined : rows === run.totalRows - 1,
    groups: typeof response?.groups === 'number' ? response.groups : undefined,
    error: typeof response?.error === 'string' ? response.error : undefined,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const runs = planRuns(args.sizes);
  if (runs.length === 0) throw new Error('No runs match --sizes. Use 100000, 500000 or 1048576.');
  const names = [...new Set(runs.map((r) => r.name))];
  const records: RunRecord[] = [];
  let server: Awaited<ReturnType<typeof preview>> | undefined;
  try {
    await generateBenchFiles(DATA_DIR, names);
    await build({ configFile: 'vite.spike.config.ts', logLevel: 'warn' });
    server = await preview({
      configFile: 'vite.spike.config.ts',
      logLevel: 'warn',
      preview: { port: PORT, strictPort: true },
    });
    const probe = await chromium.launch();
    const browserVersion = `Chromium ${probe.version()}`;
    await probe.close();
    for (const run of runs) {
      const rec = await runOne(run, args.timeoutMin * 60_000);
      records.push(rec);
      console.log(
        `${rec.file} ${rec.strategy}: ${rec.status}` +
          (rec.status === 'ok' ? ` load ${rec.loadMs} ms, query ${rec.queryMs} ms` : '') +
          `, peak ${rec.peakRssMb} MB, wall ${(rec.wallMs / 1000).toFixed(1)} s` +
          (rec.error ? `, error: ${rec.error.slice(0, 120)}` : ''),
      );
    }
    const raw: RawResults = { browser: browserVersion, node: process.version, cpus: cpus().length, ramGb: Math.round(totalmem() / 2 ** 30), runs: records };
    if (args.write) {
      await mkdir('docs', { recursive: true });
      await writeFile(RAW_RESULTS, JSON.stringify(raw, null, 2) + '\n');
      await writeFile(REPORT, renderSpikeReport(raw));
      console.log(`wrote ${RAW_RESULTS} and ${REPORT}`);
    } else {
      console.log('Partial run: docs were not written. Add --write to write them.');
    }
  } finally {
    await server?.close();
    await rm('dist-spike', { recursive: true, force: true });
    if (!args.keepFiles) await rm(DATA_DIR, { recursive: true, force: true });
  }
  // The script fails only when the harness itself is broken, meaning no run produced a result.
  const okCount = records.filter((r) => r.status === 'ok').length;
  if (okCount === 0) {
    console.error('No run finished. The harness is broken: check the build and the browser.');
    return 1;
  }
  return 0;
}

process.exit(await main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  return 1;
}));
