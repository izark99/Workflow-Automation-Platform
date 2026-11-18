import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type Cell, type SqlRunner, type TableData } from '../types';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const left: TableData = {
  columns: [
    { name: 'Id', type: 'number' },
    { name: 'Code', type: 'text' },
  ],
  rows: [
    [1, 'x'],
    [2, 'N'],
    [3, 'zz'],
    [4, null],
    [5, 'X'],
  ],
};

const codes: TableData = {
  columns: [
    { name: 'code', type: 'text' },
    { name: 'value', type: 'number' },
    { name: 'category', type: 'text' },
    { name: 'since', type: 'date' },
  ],
  rows: [
    ['X', 1, 'WORK', '2026-01-01'],
    ['N', 2, 'NIGHT', '2026-02-01'],
    ['x', 99, 'DUPLICATE', '2026-03-01'],
  ],
};

const base = {
  source: { kind: 'reference', table: 'codes' },
  keys: [{ left: 'Code', right: 'code' }],
  bring: [{ column: 'value' }, { column: 'category' }],
};

const lookup = (settings: Record<string, unknown>, extra: Partial<Parameters<typeof runNode>[2]> = {}) =>
  runNode(runner, 'lookup_join', {
    settings,
    inputs: { left },
    refTables: { codes },
    ...extra,
  });

const col = (t: TableData, i: number): Cell[] => t.rows.map((r) => r[i] ?? null);

describe('lookup from a reference table', () => {
  it('adds the brought columns, keeps every row in order, and leaves a blank where nothing matches', async () => {
    const r = await lookup(base);
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Code', 'value', 'category']);
    expect(col(r, 0)).toEqual([1, 2, 3, 4, 5]);
    expect(col(r, 2)).toEqual([1, 2, null, null, 1]);
    expect(col(r, 3)).toEqual(['WORK', 'NIGHT', null, null, 'WORK']);
  });

  it('matches text keys without regard to case, and takes the first row of the table when keys repeat', async () => {
    const r = await lookup(base);
    // "x" and "X" both match the first table row "X", not the later duplicate "x".
    expect(col(r, 3)[0]).toBe('WORK');
    expect(col(r, 3)[4]).toBe('WORK');
    expect(r.rows).toHaveLength(left.rows.length);
  });

  it('never matches a blank key', async () => {
    const withBlankCode: TableData = { ...codes, rows: [...codes.rows, [null, 5, 'BLANK', null]] };
    const r = await lookup(base, { refTables: { codes: withBlankCode } });
    expect(col(r, 2)[3]).toBeNull();
  });

  it('keeps the types of the brought columns and can rename them', async () => {
    const r = await lookup({ ...base, bring: [{ column: 'since', as: 'Valid from' }, { column: 'value', as: 'Work value' }] });
    expect(r.columns.slice(2)).toEqual([
      { name: 'Valid from', type: 'date' },
      { name: 'Work value', type: 'number' },
    ]);
    expect(col(r, 2)[0]).toBe('2026-01-01');
  });

  it('matches on several key columns', async () => {
    const multi: TableData = {
      columns: [
        { name: 'a', type: 'text' },
        { name: 'b', type: 'number' },
        { name: 'out', type: 'text' },
      ],
      rows: [
        ['p', 1, 'p1'],
        ['p', 2, 'p2'],
      ],
    };
    const l: TableData = {
      columns: [
        { name: 'A', type: 'text' },
        { name: 'B', type: 'number' },
      ],
      rows: [
        ['P', 2],
        ['p', 3],
      ],
    };
    const r = await runNode(runner, 'lookup_join', {
      settings: {
        source: { kind: 'reference', table: 'multi' },
        keys: [
          { left: 'A', right: 'a' },
          { left: 'B', right: 'b' },
        ],
        bring: [{ column: 'out' }],
      },
      inputs: { left: l },
      refTables: { multi },
    });
    expect(col(r, 2)).toEqual(['p2', null]);
  });
});

describe('behaviour when no match is found', () => {
  it('drops unmatched rows when asked', async () => {
    const r = await lookup({ ...base, onNoMatch: 'drop' });
    expect(col(r, 0)).toEqual([1, 2, 5]);
  });

  it('fails and names the key value when asked, and says what to do', async () => {
    const err = await lookup({ ...base, onNoMatch: 'fail' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('node_failed');
    expect((err as EngineError).message).toContain('zz');
    expect((err as EngineError).message).toContain('codes');
  });

  it('does not fail when every row matches', async () => {
    const r = await lookup(
      { ...base, onNoMatch: 'fail' },
      { inputs: { left: { ...left, rows: [[1, 'x'], [2, 'n']] } } },
    );
    expect(col(r, 2)).toEqual([1, 2]);
  });

  it('refuses an unknown behaviour', async () => {
    const err = await lookup({ ...base, onNoMatch: 'ignore' }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toMatch(/blank, drop, fail/);
  });
});

describe('lookup from another step', () => {
  const settings = {
    source: { kind: 'node' },
    keys: [{ left: 'Code', right: 'code' }],
    bring: [{ column: 'category' }],
  };
  it('reads the right input', async () => {
    const r = await runNode(runner, 'lookup_join', { settings, inputs: { left, right: codes } });
    expect(col(r, 2)).toEqual(['WORK', 'NIGHT', null, null, 'WORK']);
  });
  it('needs a step on the right input', async () => {
    const err = await runNode(runner, 'lookup_join', { settings, inputs: { left } }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toMatch(/right/);
  });
  it('rejects a step on the right input when the source is a reference table', async () => {
    const err = await lookup(base, { inputs: { left, right: codes } }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
  });
});

describe('mistakes', () => {
  it('names a reference table that is not available for the run', async () => {
    const err = await lookup({ ...base, source: { kind: 'reference', table: 'nope' } }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('missing_reference_table');
    expect((err as EngineError).message).toContain('"nope"');
    expect((err as EngineError).message).toContain('2026-09-30');
  });

  it('checks column names with their exact case on both sides', async () => {
    for (const bad of [
      { ...base, keys: [{ left: 'code', right: 'code' }] },
      { ...base, keys: [{ left: 'Code', right: 'Code' }] },
      { ...base, bring: [{ column: 'Value' }] },
    ]) {
      const err = await lookup(bad).catch((e: unknown) => e);
      expect((err as EngineError).code).toBe('unknown_column');
    }
  });

  it('refuses keys of different types and says how to fix it', async () => {
    const err = await lookup({ ...base, keys: [{ left: 'Id', right: 'code' }] }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toMatch(/Column mapping/);
  });

  it('refuses a brought column whose name is already in the input, also by case only', async () => {
    const a = await lookup({ ...base, bring: [{ column: 'value', as: 'Code' }] }).catch((e: unknown) => e);
    expect((a as EngineError).code).toBe('invalid_settings');
    expect((a as EngineError).message).toMatch(/"as"|new name/);
    const b = await lookup({ ...base, bring: [{ column: 'value', as: 'code' }] }).catch((e: unknown) => e);
    expect((b as EngineError).code).toBe('invalid_settings');
    const c = await lookup({ ...base, bring: [{ column: 'value' }, { column: 'category', as: 'value' }] }).catch((e: unknown) => e);
    expect((c as EngineError).code).toBe('invalid_settings');
  });

  it('refuses incomplete settings', async () => {
    for (const bad of [
      {},
      { ...base, keys: [] },
      { ...base, bring: [] },
      { ...base, source: { kind: 'sheet' } },
      { ...base, source: { kind: 'reference' } },
      { ...base, keys: [{ left: 'Code' }] },
      { ...base, bring: [{ as: 'x' }] },
    ]) {
      const err = await lookup(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toBe('invalid_settings');
    }
  });
});
