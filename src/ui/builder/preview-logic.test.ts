import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../../engine/runner/node-runner';
import type { SqlRunner } from '../../engine/types';
import type { FlowDefinition } from '../../engine/flow/types';
import { addStep, connectSteps, defaultSettings, emptyDefinition, upstreamOf } from './graph';
import { formatCell, neededFiles, previewKey, previewTarget } from './preview-logic';
import { runPreview } from './preview-runner';

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
  it('says what failed when no file was chosen for an input', async () => {
    const def = chain(['input_file']);
    await expect(runPreview({ definition: def, nodeId: 'input_file-1', handle: 'out', files: {}, refTables: [], effectiveDate: '2026-09-30', runner })).rejects.toThrow(/No file was provided|Choose a file/);
  });
});
