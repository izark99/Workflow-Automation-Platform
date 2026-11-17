import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_SAFE_XLSX_BYTES, checkFileSize } from './size-guard';

describe('checkFileSize', () => {
  it('lets an xlsx file at or below the limit through', () => {
    expect(checkFileSize({ name: 'a.xlsx', size: 1 })).toEqual({ ok: true });
    expect(checkFileSize({ name: 'a.xlsx', size: MAX_SAFE_XLSX_BYTES })).toEqual({ ok: true });
  });
  it('blocks an xlsx file above the limit and reports both sizes', () => {
    const r = checkFileSize({ name: 'big.xlsx', size: MAX_SAFE_XLSX_BYTES + 1 });
    expect(r).toEqual({ ok: false, sizeBytes: MAX_SAFE_XLSX_BYTES + 1, limitBytes: MAX_SAFE_XLSX_BYTES });
  });
  it('ignores the case of the extension and covers xlsm', () => {
    expect(checkFileSize({ name: 'BIG.XLSX', size: MAX_SAFE_XLSX_BYTES + 1 }).ok).toBe(false);
    expect(checkFileSize({ name: 'big.xlsm', size: MAX_SAFE_XLSX_BYTES + 1 }).ok).toBe(false);
  });
  it('never blocks a csv file, since DuckDB reads it from the file handle', () => {
    expect(checkFileSize({ name: 'big.csv', size: MAX_SAFE_XLSX_BYTES * 10 })).toEqual({ ok: true });
  });
});

describe('MAX_SAFE_XLSX_BYTES', () => {
  it('is not above the largest xlsx that loaded in the last spike run', () => {
    const raw = JSON.parse(readFileSync('docs/spike-raw.json', 'utf8')) as {
      runs: { format: string; strategy: string; status: string; rowsMatch?: boolean; fileBytes?: number }[];
    };
    const loaded = raw.runs
      .filter((r) => r.format === 'xlsx' && r.strategy === 'xlsx-stream' && r.status === 'ok' && r.rowsMatch !== false)
      .map((r) => r.fileBytes ?? 0);
    expect(loaded.length).toBeGreaterThan(0);
    // Re-measure with `npm run spike` and update the constant if this fails.
    expect(MAX_SAFE_XLSX_BYTES).toBeLessThanOrEqual(Math.max(...loaded));
    expect(MAX_SAFE_XLSX_BYTES).toBeGreaterThan(0.99 * Math.max(...loaded));
  });
});
