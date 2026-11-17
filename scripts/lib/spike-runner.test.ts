import { describe, expect, it } from 'vitest';
import { classifyOutcome, parseArgs, parseVmKb, planRuns } from './spike-runner.ts';

describe('parseArgs', () => {
  it('has defaults', () => {
    const a = parseArgs([]);
    expect(a.sizes).toBeUndefined();
    expect(a.keepFiles).toBe(false);
    expect(a.timeoutMin).toBe(8);
  });
  it('reads sizes, timeout and keep flag', () => {
    const a = parseArgs(['--sizes=100000,500000', '--timeout-min=2', '--keep-files']);
    expect(a.sizes).toEqual([100000, 500000]);
    expect(a.timeoutMin).toBe(2);
    expect(a.keepFiles).toBe(true);
  });
  it('rejects an unknown flag with a message that says what to do', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option --nope.*--sizes/);
  });
  it('rejects a bad size', () => {
    expect(() => parseArgs(['--sizes=abc'])).toThrow(/--sizes/);
  });
});

describe('planRuns', () => {
  it('plans sheetjs-whole for every file and duckdb-csv for csv only', () => {
    const runs = planRuns();
    expect(runs.filter((r) => r.format === 'xlsx').map((r) => r.strategy)).toEqual([
      'sheetjs-whole', 'sheetjs-whole', 'sheetjs-whole',
    ]);
    expect(runs.filter((r) => r.format === 'csv' && r.strategy === 'duckdb-csv')).toHaveLength(3);
    expect(runs).toHaveLength(9);
  });
  it('filters by size', () => {
    expect(planRuns([100_000]).every((r) => r.totalRows === 100_000)).toBe(true);
  });
});

describe('proc parsing', () => {
  it('reads VmRSS and VmHWM in kB', () => {
    const status = 'Name:\tchrome\nVmHWM:\t  2048 kB\nVmRSS:\t  1024 kB\n';
    expect(parseVmKb(status, 'VmHWM')).toBe(2048);
    expect(parseVmKb(status, 'VmRSS')).toBe(1024);
    expect(parseVmKb(status, 'VmSwap')).toBeUndefined();
  });
});

describe('classifyOutcome', () => {
  it('maps what happened to a status', () => {
    expect(classifyOutcome({ crashed: true, timedOut: false, response: undefined })).toBe('crashed');
    expect(classifyOutcome({ crashed: false, timedOut: true, response: undefined })).toBe('timeout');
    expect(classifyOutcome({ crashed: false, timedOut: false, response: { ok: false } })).toBe('error');
    expect(classifyOutcome({ crashed: false, timedOut: false, response: { ok: true } })).toBe('ok');
  });
  it('prefers a crash over a timeout', () => {
    expect(classifyOutcome({ crashed: true, timedOut: true, response: undefined })).toBe('crashed');
  });
});
