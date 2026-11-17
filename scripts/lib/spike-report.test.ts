import { describe, expect, it } from 'vitest';
import { chooseStrategy, renderSpikeReport } from './spike-report.ts';
import type { RawResults, RunRecord } from './spike-runner.ts';

function rec(p: Partial<RunRecord> & Pick<RunRecord, 'format' | 'strategy' | 'totalRows'>): RunRecord {
  return {
    file: `rows-${p.totalRows}.${p.format}`,
    fileMb: p.format === 'xlsx' ? 30 : 36,
    fileBytes: p.format === 'xlsx' ? 30_000_000 : 36_000_000,
    status: 'ok',
    loadMs: 1000,
    queryMs: 50,
    wallMs: 2000,
    peakRssMb: 500,
    rows: p.totalRows - 1,
    rowsMatch: true,
    groups: 200,
    ...p,
  };
}

function raw(runs: RunRecord[]): RawResults {
  return { browser: 'Chromium 1', node: 'v22', cpus: 4, ramGb: 16, runs };
}

const SIZES = [100_000, 500_000, 1_048_576];

function fullSet(overrides: (r: RunRecord) => RunRecord = (r) => r): RunRecord[] {
  const runs: RunRecord[] = [];
  for (const totalRows of SIZES) {
    runs.push(rec({ format: 'xlsx', strategy: 'sheetjs-whole', totalRows, loadMs: 5000 }));
    runs.push(rec({ format: 'xlsx', strategy: 'xlsx-stream', totalRows, loadMs: 9000 }));
    runs.push(rec({ format: 'csv', strategy: 'sheetjs-whole', totalRows, loadMs: 8000 }));
    runs.push(rec({ format: 'csv', strategy: 'duckdb-csv', totalRows, loadMs: 800 }));
  }
  return runs.map(overrides);
}

describe('chooseStrategy', () => {
  it('prefers the strategy that finishes at more sizes, even when it is slower', () => {
    const runs = fullSet((r) =>
      r.format === 'xlsx' && r.strategy === 'sheetjs-whole' && r.totalRows > 100_000
        ? { ...r, status: 'error', loadMs: undefined }
        : r,
    );
    expect(chooseStrategy(runs, 'xlsx')?.strategy).toBe('xlsx-stream');
  });
  it('breaks a tie on total load time', () => {
    expect(chooseStrategy(fullSet(), 'xlsx')?.strategy).toBe('sheetjs-whole');
    expect(chooseStrategy(fullSet(), 'csv')?.strategy).toBe('duckdb-csv');
  });
  it('does not count a run whose row count is wrong', () => {
    const runs = fullSet((r) =>
      r.format === 'csv' && r.strategy === 'duckdb-csv' ? { ...r, rowsMatch: false } : r,
    );
    expect(chooseStrategy(runs, 'csv')?.strategy).toBe('sheetjs-whole');
  });
  it('returns undefined when nothing ran for the format', () => {
    expect(chooseStrategy([], 'xlsx')).toBeUndefined();
  });
});

describe('renderSpikeReport', () => {
  it('has the six measurements and the chosen xlsx strategy', () => {
    const md = renderSpikeReport(raw(fullSet()));
    expect(md).toContain('# Spike results');
    expect(md).toMatch(/Chosen xlsx reading strategy: `sheetjs-whole`/);
    const six = md.split('## Six measurements')[1]!.split('## ')[0]!;
    const dataRows = six.split('\n').filter((l) => /^\| rows-/.test(l));
    expect(dataRows).toHaveLength(6);
    for (const size of SIZES) expect(six).toContain(`rows-${size}.xlsx`);
  });
  it('shows a crash as "no" for tab survived and a timeout as unknown', () => {
    const runs = fullSet((r) => {
      if (r.format === 'csv' && r.totalRows === 500_000) return { ...r, status: 'crashed', loadMs: undefined };
      if (r.format === 'csv' && r.totalRows === 1_048_576) return { ...r, status: 'timeout', loadMs: undefined };
      return r;
    });
    const md = renderSpikeReport(raw(runs));
    const line500 = md.split('\n').find((l) => l.startsWith('| rows-500000.csv') && l.includes('crashed'))!;
    expect(line500).toMatch(/\| no \|$/);
    const line1m = md.split('\n').find((l) => l.startsWith('| rows-1048576.csv') && l.includes('timeout'))!;
    expect(line1m).toMatch(/\| unknown \|$/);
  });
  it('lists every run, including the strategy that was not chosen', () => {
    const md = renderSpikeReport(raw(fullSet()));
    const all = md.split('## All runs')[1]!;
    expect(all.split('\n').filter((l) => /^\| rows-/.test(l))).toHaveLength(12);
  });
  it('says plainly when a size was not run', () => {
    const md = renderSpikeReport(raw(fullSet().filter((r) => r.totalRows === 100_000)));
    expect(md).toContain('not run');
  });
  it('reports the target checks and a size estimate for 200,000 rows', () => {
    const md = renderSpikeReport(raw(fullSet()));
    expect(md).toMatch(/200,000-row xlsx/);
    expect(md).toMatch(/estimate/);
  });
  it('reports the size guard check', () => {
    const r = raw(fullSet());
    r.guardCheck = { fileMb: 301, blocked: true, message: 'Open it in Excel, save the sheet as .csv', wallMs: 400 };
    const md = renderSpikeReport(r);
    expect(md).toContain('## Size guard');
    expect(md).toMatch(/301 MB .*refused/);
    expect(md).toContain('Result: passed');
  });
  it('says the size guard check was not run when it is missing, and failed when it did not block', () => {
    expect(renderSpikeReport(raw(fullSet()))).toMatch(/Result: not run/);
    const r = raw(fullSet());
    r.guardCheck = { fileMb: 301, blocked: false, wallMs: 400 };
    expect(renderSpikeReport(r)).toMatch(/Result: FAILED/);
  });
  it('is identical for identical input', () => {
    expect(renderSpikeReport(raw(fullSet()))).toBe(renderSpikeReport(raw(fullSet())));
  });
});
