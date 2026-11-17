// Pure helpers for the spike runner (task T0.3b): arguments, run plan, /proc parsing.
import { benchFileSpecs, type BenchFileSpec } from './bench-data.ts';

export type SpikeStrategy = 'sheetjs-whole' | 'duckdb-csv';
export type Status = 'ok' | 'error' | 'crashed' | 'timeout';

export interface SpikeArgs {
  sizes: number[] | undefined;
  keepFiles: boolean;
  timeoutMin: number;
}

export function parseArgs(argv: string[]): SpikeArgs {
  const args: SpikeArgs = { sizes: undefined, keepFiles: false, timeoutMin: 8 };
  for (const a of argv) {
    if (a === '--keep-files') args.keepFiles = true;
    else if (a.startsWith('--sizes=')) {
      const sizes = a.slice(8).split(',').map(Number);
      if (sizes.some((n) => !Number.isInteger(n) || n < 2)) {
        throw new Error(`Bad value in ${a}. --sizes takes row counts such as --sizes=100000,500000.`);
      }
      args.sizes = sizes;
    } else if (a.startsWith('--timeout-min=')) {
      const n = Number(a.slice(14));
      if (!(n > 0)) throw new Error(`Bad value in ${a}. --timeout-min takes minutes, for example --timeout-min=8.`);
      args.timeoutMin = n;
    } else {
      throw new Error(`Unknown option ${a}. Use --sizes=100000,500000, --timeout-min=8 or --keep-files.`);
    }
  }
  return args;
}

export interface PlannedRun extends BenchFileSpec {
  strategy: SpikeStrategy;
}

/** Every file with SheetJS, plus DuckDB reading the csv files directly. */
export function planRuns(sizes?: number[]): PlannedRun[] {
  const runs: PlannedRun[] = [];
  for (const spec of benchFileSpecs()) {
    if (sizes && !sizes.includes(spec.totalRows)) continue;
    runs.push({ ...spec, strategy: 'sheetjs-whole' });
    if (spec.format === 'csv') runs.push({ ...spec, strategy: 'duckdb-csv' });
  }
  return runs;
}

/** Value in kB of a line such as "VmHWM:   2048 kB" in /proc/<pid>/status. */
export function parseVmKb(status: string, key: 'VmHWM' | 'VmRSS' | 'VmSwap'): number | undefined {
  const m = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm').exec(status);
  return m ? Number(m[1]) : undefined;
}

export function classifyOutcome(o: {
  crashed: boolean;
  timedOut: boolean;
  response: { ok: boolean } | undefined;
}): Status {
  if (o.crashed) return 'crashed';
  if (o.timedOut || !o.response) return 'timeout';
  return o.response.ok ? 'ok' : 'error';
}
