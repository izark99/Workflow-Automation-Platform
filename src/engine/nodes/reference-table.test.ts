import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NODE_PORTS } from '../flow/types';
import { validateFlow } from '../flow/validate';
import { runFlow } from '../run';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { prepareRun, referencedTables, type FlowVersion, type RefTable } from '../versions';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const columns = [{ name: 'code', type: 'text' as const }, { name: 'limit', type: 'number' as const }];
const version = (versionNo: number, validFrom: string, validTo: string | null, rows: [string, number][], status?: 'draft' | 'published') => ({ versionNo, validFrom, validTo, status, columns, rows });
const limits: RefTable = {
  name: 'limits',
  versions: [version(1, '2026-01-01', '2026-09-30', [['A', 4]]), version(2, '2026-10-01', null, [['A', 6], ['B', 8]])],
};
const flowOf = (table: unknown = 'limits') => ({
  schemaVersion: 1,
  nodes: [{ id: 'ref', type: 'reference_table', settings: { table } }],
  edges: [],
});
const versionsOf = (definition: unknown): FlowVersion[] => [{ versionNo: 1, validFrom: '2020-01-01', validTo: null, definition }];

async function rowsOf(definition: unknown, date: string, tables: RefTable[] = [limits], opts: { includeDrafts?: boolean; node?: string; inputs?: Record<string, TableData> } = {}) {
  const p = prepareRun({ flowName: 'F', flowVersions: versionsOf(definition), refTables: tables, effectiveDate: date, includeDrafts: opts.includeDrafts });
  const result = await runFlow(runner, { flow: p.definition, effectiveDate: date, refTables: p.refTables, inputs: opts.inputs });
  try {
    return await result.preview(opts.node ?? 'ref');
  } finally {
    await result.dispose();
  }
}

describe('the Reference table step: ports and validation', () => {
  it('has no input and one output', () => {
    expect(NODE_PORTS.reference_table).toEqual({ inputs: { kind: 'fixed', handles: [] }, outputs: ['out'] });
  });
  it('is a valid step in a flow, and an input of another step needs a connection to it', () => {
    expect(validateFlow(flowOf()).ok).toBe(true);
  });
  it('refuses a connection into it', () => {
    const f = { ...flowOf(), nodes: [...flowOf().nodes, { id: 'in', type: 'input_file', settings: { key: 'k' } }], edges: [{ source: 'in', target: 'ref' }] };
    const r = validateFlow(f);
    expect(r.ok).toBe(false);
  });
});

describe('the Reference table step: the version of the effective date', () => {
  it('gives the rows of the version valid on each date: two versions, two dates, two results', async () => {
    const sep = await rowsOf(flowOf(), '2026-09-30');
    const oct = await rowsOf(flowOf(), '2026-10-31');
    expect(sep.columns).toEqual(columns);
    expect(sep.rows).toEqual([['A', 4]]);
    expect(oct.rows).toEqual([['A', 6], ['B', 8]]);
  });
  it('ignores a draft on a run, and uses it in the Test tab (includeDrafts)', async () => {
    const withDraft: RefTable = { name: 'limits', versions: [version(1, '2026-01-01', '2026-09-30', [['A', 4]]), version(2, '2026-10-01', null, [['A', 99]], 'draft')] };
    const err = await rowsOf(flowOf(), '2026-10-31', [withDraft]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).message).toMatch(/draft/);
    expect((await rowsOf(flowOf(), '2026-10-31', [withDraft], { includeDrafts: true })).rows).toEqual([['A', 99]]);
  });
  it('stops with the existing messages for a table that does not exist, a date no version covers, and overlapping versions', async () => {
    const missing = (await rowsOf(flowOf('nope'), '2026-10-31').catch((e: unknown) => e)) as EngineError;
    expect(missing.code).toBe('missing_reference_table');
    expect(missing.message).toContain('"nope"');
    const early = (await rowsOf(flowOf(), '2025-01-01').catch((e: unknown) => e)) as EngineError;
    expect(early.message).toMatch(/No version of reference table "limits" is valid on/);
    const overlap: RefTable = { name: 'limits', versions: [version(1, '2026-01-01', '2026-10-15', []), version(2, '2026-10-01', null, [])] };
    const both = (await rowsOf(flowOf(), '2026-10-05', [overlap]).catch((e: unknown) => e)) as EngineError;
    expect(both.messageId).toBe('engine.versionsOverlap');
  });
  it('needs a table name: no name is an error of the step, and a blank name is a table that does not exist', async () => {
    for (const bad of [null, 3]) {
      const err = (await rowsOf(flowOf(bad), '2026-10-31').catch((e: unknown) => e)) as EngineError;
      expect(err).toBeInstanceOf(EngineError);
      expect(err.code).toBe('invalid_settings');
      expect(err.message).toMatch(/Reference table step "ref"/);
    }
    for (const bad of ['', '  ']) {
      const err = (await rowsOf(flowOf(bad), '2026-10-31').catch((e: unknown) => e)) as EngineError;
      expect(err.code).toBe('missing_reference_table');
    }
  });
});

describe('referencedTables lists the step', () => {
  it('counts the table of a Reference table step once, with the tables of Lookup and Pivot', () => {
    const f = {
      schemaVersion: 1,
      nodes: [
        { id: 'a', type: 'reference_table', settings: { table: 'limits' } },
        { id: 'b', type: 'reference_table', settings: { table: 'limits' } },
        { id: 'c', type: 'reference_table', settings: { table: 'kinds' } },
        { id: 'd', type: 'lookup_join', settings: { source: { kind: 'reference', table: 'rates' } } },
        { id: 'e', type: 'reference_table', settings: {} },
        { id: 'f', type: 'reference_table', settings: { table: 5 } },
      ],
    };
    expect(referencedTables(f).sort()).toEqual(['kinds', 'limits', 'rates']);
  });
});

describe('the Reference table step feeds other steps', () => {
  const main: TableData = { columns: [{ name: 'Code', type: 'text' }], rows: [['A'], ['B']] };
  const flow = {
    schemaVersion: 1,
    nodes: [
      { id: 'in', type: 'input_file', settings: { key: 'main' } },
      { id: 'ref', type: 'reference_table', settings: { table: 'limits' } },
      { id: 'look', type: 'lookup_join', settings: { source: { kind: 'node' }, keys: [{ left: 'Code', right: 'code' }], bring: [{ column: 'limit' }], onNoMatch: 'blank' } },
      { id: 'more', type: 'reference_table', settings: { table: 'limits' } },
      { id: 'app', type: 'append', settings: { match: 'name' } },
    ],
    edges: [
      { source: 'in', target: 'look', targetHandle: 'left' },
      { source: 'ref', target: 'look', targetHandle: 'right' },
      { source: 'ref', target: 'app', targetHandle: 'in1' },
      { source: 'more', target: 'app', targetHandle: 'in2' },
    ],
  };
  it('a Lookup reads the table from its right input, with the version of the date', async () => {
    const oct = await rowsOf(flow, '2026-10-31', [limits], { node: 'look', inputs: { main } });
    expect(oct.rows).toEqual([['A', 6], ['B', 8]]);
    const sep = await rowsOf(flow, '2026-09-30', [limits], { node: 'look', inputs: { main } });
    expect(sep.rows).toEqual([['A', 4], ['B', null]]);
  });
  it('an Append stacks two Reference table steps', async () => {
    const r = await rowsOf(flow, '2026-10-31', [limits], { node: 'app', inputs: { main } });
    expect(r.rows).toEqual([['A', 6], ['B', 8], ['A', 6], ['B', 8]]);
  });
});

describe('the row limit', () => {
  it('a table of 50,000 rows, the most that a table holds, runs through the step', async () => {
    const rows: [string, number][] = Array.from({ length: 50_000 }, (_, i) => [`c${i}`, i]);
    const big: RefTable = { name: 'limits', versions: [version(1, '2026-01-01', null, rows)] };
    const p = prepareRun({ flowName: 'F', flowVersions: versionsOf(flowOf()), refTables: [big], effectiveDate: '2026-10-31' });
    const result = await runFlow(runner, { flow: p.definition, effectiveDate: '2026-10-31', refTables: p.refTables });
    try {
      expect(result.tables.get('ref/out')?.rowCount).toBe(50_000);
    } finally {
      await result.dispose();
    }
  }, 60_000);
});
