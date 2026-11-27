import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../../engine/runner/node-runner';
import type { SqlRunner } from '../../engine/types';
import type { FlowDefinition } from '../../engine/flow/types';
import { addStep, connectSteps, defaultSettings, emptyDefinition, upstreamOf } from './graph';
import { capRows, findRows, formatCell, neededFiles, previewKey, previewTarget } from './preview-logic';
import { MAX_PREVIEW_ROWS, runPreview } from './preview-runner';

const chain = (types: Parameters<typeof addStep>[1][]): FlowDefinition => {
  let def = emptyDefinition();
  let prev: string | null = null;
  for (const t of types) {
    const r = addStep(def, t, { x: 0, y: def.nodes.length * 96 });
    def = r.definition;
    if (prev) {
      const c = connectSteps(def, { source: prev, sourceHandle: null, target: r.id, targetHandle: null });
      if (c.ok) def = c.definition;
    }
    prev = r.id;
  }
  return def;
};

describe('defaults and sub-flows', () => {
  it('a new Input file step has a key and a header row; Column mapping has an empty column list', () => {
    expect(defaultSettings('input_file', 'input_file-2')).toEqual({ key: 'input_file-2', headerRow: 1 });
    expect(defaultSettings('column_mapping', 'x')).toEqual({ columns: [] });
    expect(defaultSettings('filter', 'x')).toEqual({});
    expect(defaultSettings('formula_column', 'x')).toEqual({ name: 'New column', expression: '' });
    expect(defaultSettings('group_by', 'x')).toEqual({ groupBy: [], aggregations: [] });
    expect(defaultSettings('unpivot', 'x')).toEqual({ keep: [], unpivot: [], nameColumn: 'name', valueColumn: 'value' });
    expect(defaultSettings('append', 'x')).toEqual({ match: 'name' });
    expect(defaultSettings('sql', 'x')).toEqual({ sql: '' });
    expect(defaultSettings('output', 'output-2')).toEqual({ file: 'Result', format: 'xlsx', sheet: 'Sheet2' });
    expect(defaultSettings('pivot', 'x')).toEqual({ rowKeys: [], aggregation: 'sum', columns: { from: 'data' } });
    expect(defaultSettings('lookup_join', 'x')).toEqual({ source: { kind: 'node' }, keys: [], bring: [], onNoMatch: 'blank' });
  });
  it('upstreamOf keeps the step and everything before it, and the connections between them', () => {
    const def = chain(['input_file', 'column_mapping', 'column_mapping']);
    const sub = upstreamOf(def, ['column_mapping-1']);
    expect(sub.nodes.map((n) => n.id)).toEqual(['input_file-1', 'column_mapping-1']);
    expect(sub.edges).toHaveLength(1);
  });
});

describe('previewTarget', () => {
  it('a step with outputs previews its own first output; Filter offers both', () => {
    const def = chain(['input_file', 'filter']);
    const t = previewTarget(def, def.nodes[1]!);
    expect(t).toMatchObject({ kind: 'ready', nodeId: 'filter-1', handle: 'match', handles: ['match', 'nomatch'] });
    expect(previewTarget(def, def.nodes[1]!, 'nomatch')).toMatchObject({ handle: 'nomatch' });
    expect(previewTarget(def, def.nodes[1]!, 'bogus')).toMatchObject({ handle: 'match' });
  });
  it('an Output step previews its own result table (sort and columns applied), and asks for an input when nothing feeds it', () => {
    const def = chain(['input_file', 'column_mapping', 'output']);
    expect(previewTarget(def, def.nodes[2]!)).toMatchObject({ kind: 'ready', nodeId: 'output-1', handle: 'result', handles: ['result'] });
    const lone = addStep(emptyDefinition(), 'output', { x: 0, y: 0 }).definition;
    const t = previewTarget(lone, lone.nodes[0]!);
    expect(t.kind).toBe('needs_input');
    expect((t as { message: string }).message).toMatch(/no input yet.*Setup tab/);
  });
  it('the sub-flow of a preview does not contain the steps after the target', () => {
    const def = chain(['input_file', 'column_mapping', 'output']);
    const t = previewTarget(def, def.nodes[1]!);
    expect(t.kind === 'ready' && t.definition.nodes.map((n) => n.id)).toEqual(['input_file-1', 'column_mapping-1']);
  });
});

describe('files, cells, keys', () => {
  it('lists the Input file steps with their keys', () => {
    expect(neededFiles(chain(['input_file', 'column_mapping']))).toEqual([{ stepId: 'input_file-1', label: 'Input file', key: 'input_file-1' }]);
  });
  it('formats cells for the table', () => {
    expect(formatCell(null, 'text')).toBe('');
    expect(formatCell('2026-09-30', 'date')).toBe('30 Sep 2026');
    expect(formatCell(true, 'boolean')).toBe('true');
    expect(formatCell(12.5, 'number')).toBe('12.5');
    expect(formatCell('x', 'text')).toBe('x');
  });
  it('the stale key changes with the settings, the target and the date', () => {
    const def = chain(['input_file']);
    const a = previewKey(def, 'input_file-1', 'out', '2026-09-30');
    expect(previewKey(def, 'input_file-1', 'out', '2026-09-30')).toBe(a);
    expect(previewKey(def, 'input_file-1', 'out', '2026-10-31')).not.toBe(a);
    const changed = { ...def, nodes: [{ ...def.nodes[0]!, settings: { key: 'k', headerRow: 2 } }] };
    expect(previewKey(changed, 'input_file-1', 'out', '2026-09-30')).not.toBe(a);
  });
});

describe('runPreview on the Node engine', () => {
  let runner: SqlRunner;
  beforeAll(async () => {
    runner = await createNodeRunner();
  });
  afterAll(async () => {
    await runner.close();
  });
  const csv = (text: string) => ({ name: 'a.csv', size: text.length, blob: new Blob([text]) });

  it('returns the columns, the rows and the row count of a step', async () => {
    const def = chain(['input_file', 'column_mapping']);
    const t = previewTarget(def, def.nodes[1]!);
    if (t.kind !== 'ready') throw new Error('not ready');
    const data = await runPreview({ definition: t.definition, nodeId: t.nodeId, handle: t.handle, files: { 'input_file-1': csv('name,age\nAnn,31\nBob,42\n') }, refTables: [], effectiveDate: '2026-09-30', runner });
    expect(data.columns.map((c) => c.name)).toEqual(['name', 'age']);
    expect(data.rows).toEqual([['Ann', 31], ['Bob', 42]]);
    expect(data.totalRows).toBe(2);
  });
  it('caps the rows at 100 and reports the full count', async () => {
    const def = chain(['input_file']);
    const lines = Array.from({ length: 250 }, (_, i) => `r${i},${i}`).join('\n');
    const data = await runPreview({ definition: def, nodeId: 'input_file-1', handle: 'out', files: { 'input_file-1': csv(`k,v\n${lines}\n`) }, refTables: [], effectiveDate: '2026-09-30', runner });
    expect(data.rows).toHaveLength(100);
    expect(data.totalRows).toBe(250);
  });
  it('takes a limit: up to 1,000 rows, never more, and the last part counts from the limit', async () => {
    const def = chain(['input_file']);
    const lines = Array.from({ length: 1500 }, (_, i) => `r${i},${i}`).join('\n');
    const base = { definition: def, nodeId: 'input_file-1', handle: 'out', files: { 'input_file-1': csv(`k,v\n${lines}\n`) }, refTables: [], effectiveDate: '2026-09-30', runner };
    expect((await runPreview({ ...base, limit: 1000 })).rows).toHaveLength(1000);
    expect((await runPreview({ ...base, limit: 5000 })).rows).toHaveLength(MAX_PREVIEW_ROWS);
    expect((await runPreview({ ...base, limit: 0 })).rows).toHaveLength(1);
    const last = await runPreview({ ...base, limit: 1000, part: 'last' });
    expect(last.rows).toHaveLength(1000);
    expect(last.fromRow).toBe(501);
    expect(last.totalRows).toBe(1500);
  });
  it('says what failed when no file was chosen for an input', async () => {
    const def = chain(['input_file']);
    await expect(runPreview({ definition: def, nodeId: 'input_file-1', handle: 'out', files: {}, refTables: [], effectiveDate: '2026-09-30', runner })).rejects.toThrow(/No file was provided|Choose a file/);
  });
  it('a Reference table step previews the version of the date, and a draft counts in a test run', async () => {
    const def = { schemaVersion: 1, nodes: [{ id: 'ref', type: 'reference_table', settings: { table: 'limits' } }], edges: [] } as unknown as Parameters<typeof runPreview>[0]['definition'];
    const columns = [{ name: 'code', type: 'text' as const }];
    const refTables = [{ name: 'limits', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: '2026-09-30', columns, rows: [['A']] }, { versionNo: 2, validFrom: '2026-10-01', validTo: null, status: 'draft' as const, columns, rows: [['B'], ['C']] }] }];
    const on = (effectiveDate: string) => runPreview({ definition: def, nodeId: 'ref', handle: 'out', files: {}, refTables, effectiveDate, runner });
    expect((await on('2026-09-30')).rows).toEqual([['A']]);
    expect((await on('2026-10-31')).rows).toEqual([['B'], ['C']]);
  });
  it('a preview asks only for the parameters that its steps read, and uses defaults for values not given', async () => {
    let def = chain(['input_file', 'filter']);
    def = { ...def, schemaVersion: 2, parameters: [
      { key: 'min_age', label: 'Min age', type: 'number', required: true },
      { key: 'unused', label: 'Unused', type: 'text', required: true },
      { key: 'floor', label: 'Floor', type: 'number', required: true, default: 0 },
    ], nodes: def.nodes.map((n) => (n.type === 'filter' ? { ...n, settings: { condition: '[age] > PARAM("min_age") + PARAM("floor")' } } : n)) };
    const t = previewTarget(def, def.nodes[1]!);
    if (t.kind !== 'ready') throw new Error('not ready');
    const base = { definition: t.definition, nodeId: t.nodeId, handle: t.handle, files: { 'input_file-1': csv('name,age\nAnn,31\nBob,42\n') }, refTables: [], effectiveDate: '2026-09-30', runner };
    const data = await runPreview({ ...base, parameterValues: { min_age: 35 } });
    expect(data.rows).toEqual([['Bob', 42]]);
    await expect(runPreview(base)).rejects.toThrow(/"Min age" needs a value/);
  });
});

describe('findRows', () => {
  const rows = [['Lan Nguyễn', '12'], ['Bình Trần', '7'], ['lan Phạm', '300']];
  it('keeps the rows with a cell that contains the text, not case sensitive, and says which they are', () => {
    expect(findRows(rows, 'LAN')).toEqual([0, 2]);
    expect(findRows(rows, '300')).toEqual([2]);
    expect(findRows(rows, 'xyz')).toEqual([]);
  });
  it('keeps every row for an empty text, and trims it', () => {
    expect(findRows(rows, '')).toEqual([0, 1, 2]);
    expect(findRows(rows, '   ')).toEqual([0, 1, 2]);
    expect(findRows(rows, ' bình ')).toEqual([1]);
  });
  it('matches a text that spans two words of one cell, and does not match across two cells', () => {
    expect(findRows(rows, 'lan ph')).toEqual([2]);
    expect(findRows(rows, 'nguyễn 12')).toEqual([]);
  });
});

describe('capRows', () => {
  const rows = Array.from({ length: 300 }, (_, i) => [i]);
  const base = { columns: [{ name: 'n', type: 'number' as const }], rows, totalRows: 1500, warnings: [] };
  it('keeps the first rows of the first part, the last rows of the last part with their real start', () => {
    const first = capRows({ ...base, part: 'first', fromRow: 1 }, 100);
    expect(first.rows).toHaveLength(100);
    expect(first.rows[0]).toEqual([0]);
    expect(first.fromRow).toBe(1);
    const last = capRows({ ...base, part: 'last', fromRow: 1201 }, 100);
    expect(last.rows[0]).toEqual([200]);
    expect(last.fromRow).toBe(1401);
  });
  it('returns the same object when there is nothing to drop', () => {
    const small = { ...base, rows: rows.slice(0, 50), part: 'first' as const, fromRow: 1 };
    expect(capRows(small, 100)).toBe(small);
  });
});
