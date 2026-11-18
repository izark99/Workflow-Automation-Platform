import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION } from '../flow/types';
import { runFlow } from '../run';
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
    { name: 'Day', type: 'number' },
    { name: 'OT hours', type: 'number' },
    { name: 'Code', type: 'text' },
  ],
  rows: [
    [3, 5, 'x'],
    [31, 2, 'y'],
    [7, null, null],
  ],
};

const formula = (settings: Record<string, unknown>, data = input) =>
  runNode(runner, 'formula_column', { settings, inputs: { in: data } });

describe('formula column node', () => {
  it('adds a column at the end and keeps the others', async () => {
    const r = await formula({ name: 'Level', expression: 'IF([OT hours] > 4, "Over", "OK")' });
    expect(r.columns).toEqual([...input.columns, { name: 'Level', type: 'text' }]);
    expect(r.rows.map((row) => row[3])).toEqual(['Over', 'OK', 'OK']);
    expect(r.rows.map((row) => row.slice(0, 3))).toEqual(input.rows);
  });

  it('builds a date from a day number and the effective date of the run', async () => {
    const r = await formula({
      name: 'Date',
      expression: 'DATE(YEAR(EFFECTIVE_DATE()), MONTH(EFFECTIVE_DATE()), [Day])',
    });
    expect(r.columns[3]).toEqual({ name: 'Date', type: 'date' });
    expect(r.rows.map((row) => row[3])).toEqual(['2026-09-03', '2026-10-01', '2026-09-07']);
  });

  it('uses another effective date when the run uses another one', async () => {
    const r = await runNode(runner, 'formula_column', {
      settings: { name: 'M', expression: 'MONTH(EFFECTIVE_DATE())' },
      inputs: { in: input },
      effectiveDate: '2026-10-31',
    });
    expect(r.rows.map((row) => row[3])).toEqual([10, 10, 10]);
  });

  it('replaces a column of the same name in place and changes its type', async () => {
    const r = await formula({ name: 'Code', expression: '[Day] * 2' });
    expect(r.columns.map((c) => c.name)).toEqual(['Day', 'OT hours', 'Code']);
    expect(r.columns[2]).toEqual({ name: 'Code', type: 'number' });
    expect(r.rows.map((row) => row[2])).toEqual([6, 62, 14]);
  });

  it('can use a column that an earlier formula column added', async () => {
    const result = await runFlow(runner, {
      flow: {
        schemaVersion: FLOW_SCHEMA_VERSION,
        nodes: [
          { id: 'in', type: 'input_file', settings: { key: 'k' } },
          { id: 'a', type: 'formula_column', settings: { name: 'Double', expression: '[Day] * 2' } },
          { id: 'b', type: 'formula_column', settings: { name: 'Plus', expression: '[Double] + 1' } },
        ],
        edges: [
          { source: 'in', target: 'a' },
          { source: 'a', target: 'b' },
        ],
      },
      effectiveDate: '2026-09-30',
      inputs: { k: input },
    });
    try {
      expect((await result.preview('b')).rows.map((row) => row[4])).toEqual([7, 63, 15]);
    } finally {
      await result.dispose();
    }
  });

  it('gives a blank where the formula has an error, and keeps every row', async () => {
    const r = await formula({ name: 'Ratio', expression: '[Day] / ([Day] - 3)' });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.map((row) => row[3])).toEqual([null, 31 / 28, 7 / 4]);
  });

  it('refuses a name that differs from an existing column only by case', async () => {
    const err = await formula({ name: 'day', expression: '1' }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
    expect((err as EngineError).message).toContain('"Day"');
  });

  it('refuses a missing or empty name and expression', async () => {
    for (const bad of [{ expression: '1' }, { name: '', expression: '1' }, { name: ' ', expression: '1' }, { name: 5, expression: '1' }]) {
      const err = await formula(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toBe('invalid_settings');
    }
    for (const bad of [{ name: 'X' }, { name: 'X', expression: '' }, { name: 'X', expression: 4 }]) {
      const err = await formula(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, JSON.stringify(bad)).toMatch(/invalid_/);
    }
  });

  it('reports a formula mistake with the step, the setting and the character', async () => {
    const err = await formula({ name: 'X', expression: '[Day] +' }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).nodeId).toBe('under_test');
    expect((err as EngineError).message).toMatch(/Formula column step "under_test", expression \(character 8\)/);
  });

  it('reports a column with the wrong case', async () => {
    const err = await formula({ name: 'X', expression: '[day] + 1' }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_formula');
    expect((err as EngineError).message).toContain('"Day"');
  });
});
