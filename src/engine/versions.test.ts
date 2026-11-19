import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION } from './flow/types';
import { createNodeRunner } from './runner/node-runner';
import { runFlow } from './run';
import { EngineError, type SqlRunner, type TableData } from './types';
import {
  dayAfter,
  dayBefore,
  findOverlaps,
  formatDate,
  isIsoDate,
  planPublish,
  prepareRun,
  referencedTables,
  resolveVersion,
  type FlowVersion,
  type RefTable,
} from './versions';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const v = (versionNo: number, validFrom: string, validTo: string | null, status: 'draft' | 'published' = 'published') => ({
  versionNo,
  validFrom,
  validTo,
  status,
});

function failure(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    return e as EngineError;
  }
  throw new Error('should have thrown');
}

describe('dates', () => {
  it('accepts only real calendar dates in ISO form', () => {
    for (const ok of ['2026-09-30', '2024-02-29', '2026-01-01']) expect(isIsoDate(ok), ok).toBe(true);
    for (const bad of ['2026-02-29', '2026-13-01', '2026-9-3', '30/09/2026', '', '2026-09-31', 'x']) expect(isIsoDate(bad), bad).toBe(false);
  });
  it('formats a date for the screen as 30 Sep 2026', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026');
    expect(formatDate('2026-01-05')).toBe('5 Jan 2026');
  });
});

describe('resolveVersion', () => {
  const versions = [v(1, '2026-01-01', '2026-08-31'), v(2, '2026-10-01', null)];
  const resolve = (date: string, list = versions, includeDrafts = false) =>
    resolveVersion(list, date, { what: 'reference table "codes"', includeDrafts });

  it('picks the version whose range holds the date, both ends included', () => {
    expect(resolve('2026-01-01').versionNo).toBe(1);
    expect(resolve('2026-08-31').versionNo).toBe(1);
    expect(resolve('2026-10-01').versionNo).toBe(2);
    expect(resolve('2030-05-05').versionNo).toBe(2);
  });

  it('stops when no version covers the date, and never picks the nearest one', () => {
    const gap = failure(() => resolve('2026-09-15'));
    expect(gap.code).toBe('no_version');
    expect(gap.message).toContain('reference table "codes"');
    expect(gap.message).toContain('15 Sep 2026');
    expect(gap.message).toContain('1 Jan 2026 to 31 Aug 2026');
    expect(gap.message).toContain('from 1 Oct 2026');
    expect(gap.message).toMatch(/Pick an effective date|add a version/);
    expect(failure(() => resolve('2025-12-31')).code).toBe('no_version');
    expect(failure(() => resolve('2026-09-01', [v(1, '2026-01-01', '2026-08-31')])).code).toBe('no_version');
  });

  it('says so when the table has no published version at all', () => {
    const e = failure(() => resolve('2026-01-01', []));
    expect(e.code).toBe('no_version');
    expect(e.message).toMatch(/no published version/);
  });

  it('ignores drafts unless asked, and says when only a draft covers the date', () => {
    const list = [v(1, '2026-01-01', '2026-08-31'), v(2, '2026-09-01', null, 'draft')];
    const e = failure(() => resolve('2026-09-15', list));
    expect(e.message).toMatch(/draft/);
    expect(e.message).toMatch(/Publish/);
    expect(resolve('2026-09-15', list, true).versionNo).toBe(2);
  });

  it('reports versions that overlap on the date', () => {
    const e = failure(() => resolve('2026-06-01', [v(1, '2026-01-01', null), v(2, '2026-05-01', null)]));
    expect(e.code).toBe('invalid_versions');
    expect(e.message).toMatch(/1 and 2/);
  });

  it('rejects an invalid effective date or version range', () => {
    expect(failure(() => resolve('2026-02-30')).code).toBe('invalid_versions');
    expect(failure(() => resolve('2026-09-01', [v(1, '2026-13-01', null)])).code).toBe('invalid_versions');
    expect(failure(() => resolve('2026-09-01', [v(1, '2026-09-10', '2026-09-01')])).message).toMatch(/ends before it starts/);
  });
});

describe('findOverlaps', () => {
  it('finds pairs of versions whose ranges share a day, with open ends', () => {
    expect(findOverlaps([v(1, '2026-01-01', '2026-06-30'), v(2, '2026-07-01', null)])).toEqual([]);
    expect(findOverlaps([v(1, '2026-01-01', '2026-07-01'), v(2, '2026-07-01', null)])).toEqual([[1, 2]]);
    expect(findOverlaps([v(1, '2026-01-01', null), v(2, '2026-03-01', '2026-04-01'), v(3, '2027-01-01', null)])).toEqual([[1, 2], [1, 3]]);
  });
});

const lookupFlow = (extra: unknown[] = []) => ({
  schemaVersion: FLOW_SCHEMA_VERSION,
  nodes: [
    { id: 'in', type: 'input_file', settings: { key: 'main' } },
    {
      id: 'look',
      type: 'lookup_join',
      settings: { source: { kind: 'reference', table: 'limits' }, keys: [{ left: 'Code', right: 'code' }], bring: [{ column: 'limit' }] },
    },
    ...extra,
  ],
  edges: [{ source: 'in', target: 'look', targetHandle: 'left' }],
});

describe('referencedTables', () => {
  it('lists the reference tables that Lookup and Pivot steps read, once each', () => {
    const flow = lookupFlow([
      { id: 'p', type: 'pivot', settings: { columns: { from: 'reference', table: 'cats', column: 'c' } } },
      { id: 'l2', type: 'lookup_join', settings: { source: { kind: 'reference', table: 'limits' } } },
      { id: 'l3', type: 'lookup_join', settings: { source: { kind: 'node' } } },
    ]);
    expect(referencedTables(flow).sort()).toEqual(['cats', 'limits']);
  });
});

describe('prepareRun', () => {
  const table = (rows: [string, number][]): { columns: TableData['columns']; rows: TableData['rows'] } => ({
    columns: [{ name: 'code', type: 'text' }, { name: 'limit', type: 'number' }],
    rows,
  });
  const flowVersions: FlowVersion[] = [
    { ...v(1, '2026-01-01', '2026-09-30'), definition: lookupFlow() },
    { ...v(2, '2026-10-01', null), definition: lookupFlow() },
  ];
  const limits: RefTable = {
    name: 'limits',
    versions: [
      { ...v(1, '2026-01-01', '2026-09-30'), ...table([['A', 4]]) },
      { ...v(2, '2026-10-01', null), ...table([['A', 6]]) },
    ],
  };
  const unused: RefTable = { name: 'unused', versions: [] };
  const main: TableData = { columns: [{ name: 'Code', type: 'text' }], rows: [['A']] };

  it('picks the flow version and the versions of the tables the flow reads, and says which', () => {
    const p = prepareRun({ flowName: 'Monthly', flowVersions, refTables: [limits, unused], effectiveDate: '2026-10-31' });
    expect(p.resolved).toEqual({ flow: 2, refTables: { limits: 2 } });
    expect(p.definition).toBe(flowVersions[1]!.definition);
    expect(Object.keys(p.refTables)).toEqual(['limits']);
  });

  it('gives different results for different dates with the same flow and the same data', async () => {
    const limitFor = async (date: string) => {
      const p = prepareRun({ flowName: 'Monthly', flowVersions, refTables: [limits], effectiveDate: date });
      const result = await runFlow(runner, { flow: p.definition, effectiveDate: date, inputs: { main }, refTables: p.refTables });
      try {
        return (await result.preview('look')).rows[0]?.[1];
      } finally {
        await result.dispose();
      }
    };
    expect(await limitFor('2026-09-30')).toBe(4);
    expect(await limitFor('2026-10-31')).toBe(6);
  });

  it('stops with a clear message when the flow has no version for the date', () => {
    const e = failure(() => prepareRun({ flowName: 'Monthly', flowVersions, refTables: [limits], effectiveDate: '2025-12-31' }));
    expect(e.code).toBe('no_version');
    expect(e.message).toContain('flow "Monthly"');
  });

  it('stops when a table that the flow reads has no version for the date, naming the table', () => {
    const late: RefTable = { name: 'limits', versions: [{ ...v(1, '2026-11-01', null), ...table([['A', 1]]) }] };
    const e = failure(() => prepareRun({ flowName: 'Monthly', flowVersions, refTables: [late], effectiveDate: '2026-10-31' }));
    expect(e.code).toBe('no_version');
    expect(e.message).toContain('reference table "limits"');
  });

  it('names a table that the flow reads but that does not exist', () => {
    const e = failure(() => prepareRun({ flowName: 'Monthly', flowVersions, refTables: [], effectiveDate: '2026-10-31' }));
    expect(e.code).toBe('missing_reference_table');
    expect(e.message).toContain('"limits"');
  });
});

describe('planPublish', () => {
  const v = (versionNo: number, validFrom: string, validTo: string | null, status: 'draft' | 'published') => ({ versionNo, validFrom, validTo, status });
  it('says which version a publish ends: the previous open-ended one, the day before', () => {
    const plan = planPublish([v(3, '2026-07-01', null, 'published'), v(4, '2027-01-01', null, 'draft')], 4, 'flow "F"');
    expect(plan).toEqual({ ok: true, ends: { versionNo: 3, validTo: '2026-12-31' } });
  });
  it('a first version or a version after a closed one ends nothing', () => {
    expect(planPublish([v(1, '2026-01-01', null, 'draft')], 1, 'x')).toEqual({ ok: true, ends: undefined });
    expect(planPublish([v(1, '2026-01-01', '2026-03-31', 'published'), v(2, '2026-04-01', null, 'draft')], 2, 'x')).toEqual({ ok: true, ends: undefined });
  });
  it('refuses a missing version, a published one, and an overlap, with a message that says what to do', () => {
    expect(planPublish([], 1, 'x')).toMatchObject({ ok: false, kind: 'not_found' });
    expect(planPublish([v(1, '2026-01-01', null, 'published')], 1, 'x')).toMatchObject({ ok: false, kind: 'already_published' });
    const overlap = planPublish([v(1, '2026-01-01', '2026-12-31', 'published'), v(2, '2026-06-01', null, 'draft')], 2, 'table "T"');
    expect(overlap).toMatchObject({ ok: false, kind: 'overlap' });
    expect((overlap as { message: string }).message).toMatch(/would overlap v1.*Change the valid-from or valid-to/);
  });
  it('does not change the versions it is given', () => {
    const versions = [v(1, '2026-01-01', null, 'published'), v(2, '2026-07-01', null, 'draft')];
    planPublish(versions, 2, 'x');
    expect(versions[0]!.validTo).toBeNull();
    expect(versions[1]!.status).toBe('draft');
  });
  it('day arithmetic crosses month and year ends', () => {
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayAfter('2026-02-28')).toBe('2026-03-01');
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
  });
});

// The database function `ref_table_names()` (migration 16) follows this rule, and supabase/tests/database/150 checks the same
// cases. If the rule changes here, change both.
describe('referencedTables, the cases of the database function', () => {
  const lookup = (source: unknown) => ({ nodes: [{ type: 'lookup_join', settings: { source } }] });
  const pivot = (columns: unknown) => ({ nodes: [{ type: 'pivot', settings: { columns } }] });
  it('a Lookup with a reference source and a Pivot with a reference column list read their table', () => {
    expect(referencedTables(lookup({ kind: 'reference', table: 'Limits' }))).toEqual(['Limits']);
    expect(referencedTables(pivot({ from: 'reference', table: 'Codes' }))).toEqual(['Codes']);
  });
  it('another source, another step type and odd shapes read none', () => {
    expect(referencedTables(lookup({ kind: 'node' }))).toEqual([]);
    expect(referencedTables(pivot({ from: 'data' }))).toEqual([]);
    expect(referencedTables({ nodes: [{ type: 'filter', settings: { source: { kind: 'reference', table: 'Limits' } } }] })).toEqual([]);
    expect(referencedTables({})).toEqual([]);
    expect(referencedTables({ nodes: 'x' })).toEqual([]);
    expect(referencedTables([1, 2])).toEqual([]);
    expect(referencedTables({ nodes: [1, 'a', null, { type: 'lookup_join' }, ...lookup({ kind: 'reference', table: 5 }).nodes] })).toEqual([]);
  });
  it('each table once', () => {
    const def = { nodes: [...lookup({ kind: 'reference', table: 'B' }).nodes, ...pivot({ from: 'reference', table: 'A' }).nodes, ...lookup({ kind: 'reference', table: 'B' }).nodes] };
    expect([...referencedTables(def)].sort()).toEqual(['A', 'B']);
  });
});
