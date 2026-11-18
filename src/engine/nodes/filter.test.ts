import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
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
    { name: 'Name', type: 'text' },
    { name: 'OT hours', type: 'number' },
    { name: 'Day', type: 'date' },
  ],
  rows: [
    ['a', 5, '2026-09-01'],
    ['b', 4, '2026-09-02'],
    ['c', null, '2026-09-03'],
    ['d', 9, null],
    ['e', 1, '2026-09-05'],
  ],
};

const filter = (condition: unknown, handle: 'match' | 'nomatch' = 'match', data = input) =>
  runNode(runner, 'filter', { settings: { condition }, inputs: { in: data }, handle });

const names = (t: TableData) => t.rows.map((r) => r[0]);

describe('filter node', () => {
  it('sends matching rows to match and all other rows to nomatch, in input order', async () => {
    expect(names(await filter('[OT hours] > 4'))).toEqual(['a', 'd']);
    expect(names(await filter('[OT hours] > 4', 'nomatch'))).toEqual(['b', 'c', 'e']);
  });

  it('keeps the input columns and types on both outputs', async () => {
    for (const h of ['match', 'nomatch'] as const) {
      expect((await filter('TRUE', h)).columns).toEqual(input.columns);
    }
  });

  it('puts a row whose condition is blank into nomatch, so no row is lost', async () => {
    // [Day] is blank for row d, so the comparison is blank, not false.
    const match = names(await filter('[Day] > [Day]'));
    const rest = names(await filter('[Day] > [Day]', 'nomatch'));
    expect(match).toEqual([]);
    expect(rest).toEqual(['a', 'b', 'c', 'd', 'e']);
    const m2 = await filter('[Day] = [Day]');
    const n2 = await filter('[Day] = [Day]', 'nomatch');
    expect(m2.rows.length + n2.rows.length).toBe(input.rows.length);
    expect(names(n2)).toEqual(['d']);
  });

  it('counts a blank cell as 0 in a number comparison', async () => {
    expect(names(await filter('[OT hours] = 0'))).toEqual(['c']);
  });

  it('supports text comparison, & and combined conditions through operators', async () => {
    expect(names(await filter('[Name] = "A"'))).toEqual(['a']);
    expect(names(await filter('[Name] & "x" = "bx"'))).toEqual(['b']);
  });

  it('tells which condition is wrong, with the position', async () => {
    const err = await filter('[OT hours] >').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).nodeId).toBe('under_test');
    expect((err as EngineError).message).toContain('character 13');
    expect((err as EngineError).message).toContain('Filter');
  });

  it('rejects an empty or missing condition and a non-text condition', async () => {
    for (const bad of ['', '  ', undefined, 5]) {
      const err = await filter(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, String(bad)).toMatch(/invalid_/);
    }
  });

  it('rejects a condition that is not true or false', async () => {
    const err = await filter('[OT hours] + 1').catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).message).toMatch(/true or false/);
  });

  it('rejects a column with the wrong case', async () => {
    const err = await filter('[ot hours] > 1').catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).message).toContain('"OT hours"');
  });
});
