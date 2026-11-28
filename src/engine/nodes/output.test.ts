import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { checkOutputNodes, parseOutputSettings } from './output';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const input: TableData = {
  columns: [
    { name: 'Who', type: 'text' },
    { name: 'Level', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Rank', type: 'number' },
  ],
  rows: [
    ['b', 'WEEK', 5, 1],
    ['a', 'MONTH', 7, 2],
    ['b', 'DAY', 3, 3],
    ['a', 'DAY', 3, 4],
    [null, 'DAY', 1, 5],
    ['a', 'WEEK', 9, 6],
  ],
};

const base = { file: 'Result', sheet: 'Out' };
const out = (settings: Record<string, unknown>, data: TableData = input) =>
  runNode(runner, 'output', { settings: { ...base, ...settings }, inputs: { in: data }, handle: 'result' });
const col = (t: TableData, i: number) => t.rows.map((r) => r[i]);

describe('output node: sort and columns', () => {
  it('passes the rows through in input order when no sort is set', async () => {
    const r = await out({});
    expect(col(r, 3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.columns).toEqual(input.columns);
  });

  it('sorts by columns, ascending by default, blanks last, ties in input order', async () => {
    const r = await out({ sort: [{ column: 'Who' }, { column: 'Hours', direction: 'desc' }] });
    expect(col(r, 3)).toEqual([6, 2, 4, 1, 3, 5]);
  });

  it('sorts descending with blanks still last', async () => {
    const r = await out({ sort: [{ column: 'Who', direction: 'desc' }] });
    expect(col(r, 0)).toEqual(['b', 'b', 'a', 'a', 'a', null]);
  });

  it('sorts by a formula, for an order that is not alphabetical', async () => {
    const r = await out({
      sort: [{ expression: 'IFS([Level] = "DAY", 1, [Level] = "WEEK", 2, TRUE, 3)' }, { column: 'Rank' }],
    });
    expect(col(r, 3)).toEqual([3, 4, 5, 1, 6, 2]);
  });

  it('writes only the listed columns, in that order, and can sort by one that is not listed', async () => {
    const r = await out({ columns: ['Hours', 'Who'], sort: [{ column: 'Rank', direction: 'desc' }] });
    expect(r.columns.map((c) => c.name)).toEqual(['Hours', 'Who']);
    expect(col(r, 0)).toEqual([9, 1, 3, 3, 7, 5]);
  });
});

describe('output node: mistakes', () => {
  it('checks column names with their case', async () => {
    for (const bad of [{ columns: ['who'] }, { sort: [{ column: 'who' }] }]) {
      const err = await out(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toBe('unknown_column');
    }
  });

  it('reports a sort formula mistake with the character', async () => {
    const err = await out({ sort: [{ expression: '[Hours] +' }] }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).message).toMatch(/Output step "under_test"/);
  });

  it('refuses settings it cannot read', async () => {
    const cases: Record<string, unknown>[] = [
      { file: '' },
      { format: 'pdf' },
      { sheet: '' },
      { sheet: 'a/b' },
      { sheet: 'x'.repeat(32) },
      { sheet: "'quoted'" },
      { sort: 'Who' },
      { sort: [{}] },
      { sort: [{ column: 'Who', expression: '1' }] },
      { sort: [{ column: 'Who', direction: 'up' }] },
      { columns: 'Who' },
      { columns: [] },
      { columns: ['Who', 'Who'] },
      { numberLikeText: 'Who' },
      { numberLikeText: ['Hours'] },
    ];
    for (const bad of cases) {
      const err = await out(bad).catch((e: unknown) => e);
      expect(err, JSON.stringify(bad)).toBeInstanceOf(EngineError);
      expect((err as EngineError).code, JSON.stringify(bad)).toMatch(/invalid_settings|unknown_column/);
    }
  });

  it('needs a sheet name for xlsx, but not for csv', async () => {
    const noSheet = await runNode(runner, 'output', { settings: { file: 'R' }, inputs: { in: input }, handle: 'result' }).catch((e: unknown) => e);
    expect((noSheet as EngineError).code).toBe('invalid_settings');
    const csv = await runNode(runner, 'output', { settings: { file: 'R', format: 'csv' }, inputs: { in: input }, handle: 'result' });
    expect(csv.rows).toHaveLength(6);
  });

  it('rejects numberLikeText on a column that is not text', async () => {
    const err = await out({ numberLikeText: ['Hours'] }).catch((e: unknown) => e);
    expect((err as EngineError).message).toMatch(/text column/);
  });
});

describe('checkOutputNodes (several output steps in one run)', () => {
  const node = (id: string, settings: Record<string, unknown>) => ({ id, type: 'output' as const, settings });
  const flow = (...nodes: ReturnType<typeof node>[]) => ({ schemaVersion: 1 as const, nodes, edges: [] });

  it('accepts several sheets in one workbook, and another file next to it', () => {
    expect(() =>
      checkOutputNodes(
        flow(node('a', { file: 'R', sheet: 'One' }), node('b', { file: 'R', sheet: 'Two' }), node('c', { file: 'Flat', format: 'csv' })),
      ),
    ).not.toThrow();
  });

  it('refuses the same sheet name twice in one file, also by case', () => {
    const err = (() => {
      try {
        checkOutputNodes(flow(node('a', { file: 'R', sheet: 'One' }), node('b', { file: 'R', sheet: 'one' })));
      } catch (e) {
        return e as EngineError;
      }
    })();
    expect(err?.code).toBe('invalid_settings');
    expect(err?.message).toMatch(/"One"/);
  });

  it('refuses two csv steps for one file, and one file in two formats', () => {
    expect(() => checkOutputNodes(flow(node('a', { file: 'R', format: 'csv' }), node('b', { file: 'R', format: 'csv' })))).toThrow(/csv/);
    expect(() => checkOutputNodes(flow(node('a', { file: 'R', sheet: 'S' }), node('b', { file: 'R', format: 'csv' })))).toThrow(/format/);
  });
});

describe('the print layout setting of an Output step', () => {
  const base = { file: 'R', format: 'xlsx', sheet: 'S' };
  it('has no layout when the step has none, and reads the layout when it has one', () => {
    expect(parseOutputSettings(base, 'o').print).toBeUndefined();
    const p = parseOutputSettings({ ...base, print: { paper: 'A3', header: [{ text: 'Báo cáo {flow}', bold: true }] } }, 'o').print;
    expect(p).toMatchObject({ enabled: true, paper: 'A3' });
    expect(p?.header[0]).toMatchObject({ text: 'Báo cáo {flow}', bold: true, align: 'left' });
  });
  it('turns a message of the layout into a message of the step', () => {
    expect(() => parseOutputSettings({ ...base, print: { paper: 'B5' } }, 'out-1')).toThrow(/Output step "out-1": The paper is "B5"/);
  });
  it('keeps the layout of a csv step without using it (the group is not shown for csv)', () => {
    expect(parseOutputSettings({ file: 'R', format: 'csv', print: { enabled: true } }, 'o').print?.enabled).toBe(true);
  });
});
