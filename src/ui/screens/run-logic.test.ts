import { describe, expect, it } from 'vitest';
import { prepareRun } from '../../engine/versions';
import type { RefTable } from '../../engine/versions';
import { seedSnapshot } from '../../store/seed';
import { addStep, emptyDefinition } from '../builder/graph';
import type { FlowDefinition } from '../../engine/flow/types';
import { boundRows, inputsOf, progressText, runDateCheck, sheetLabel, sizeLabel, versionRows } from './run-logic';

describe('inputs of a flow', () => {
  it('one file for each Input file step key, in step order, and a key used twice is asked once', () => {
    let d = addStep(emptyDefinition(), 'input_file', { x: 0, y: 0 }).definition;
    d = addStep(d, 'filter', { x: 0, y: 96 }).definition;
    d = addStep(d, 'input_file', { x: 0, y: 192 }).definition;
    d = addStep(d, 'input_file', { x: 0, y: 288 }).definition;
    d.nodes[3]!.settings = { key: 'input_file-1' };
    expect(inputsOf(d).map((i) => [i.key, i.label])).toEqual([['input_file-1', 'Input file'], ['input_file-2', 'Input file 2']]);
  });
  it('a step without a key asks for nothing', () => {
    const d = addStep(emptyDefinition(), 'input_file', { x: 0, y: 0 }).definition;
    d.nodes[0]!.settings = {};
    expect(inputsOf(d)).toEqual([]);
  });
});

describe('texts', () => {
  it('progress, sizes and sheet labels', () => {
    expect(progressText(7, 12, 'Group OT hours')).toBe('Step 7 of 12: Group OT hours');
    expect([sizeLabel(512), sizeLabel(12_345), sizeLabel(3_400_000)]).toEqual(['512 B', '12 KB', '3.4 MB']);
    expect(sheetLabel('Summary', 11)).toBe('Summary, 11 rows');
    expect(sheetLabel('X', 1)).toBe('X, 1 row');
    expect(sheetLabel('Big', 12345)).toBe('Big, 12,345 rows');
  });
});

describe('versions used for a date', () => {
  const snap = seedSnapshot();
  const flow = snap.flows.find((f) => f.id === 'flow-timesheet')!;
  const refs: RefTable[] = snap.refTables;
  it('lists the flow version and the version of each reference table the flow reads, with their ranges', () => {
    // The seed flow reads no reference table; give it a lookup so that two tables are read.
    const definition = { schemaVersion: 1, nodes: [{ id: 'l', type: 'lookup_join', settings: { source: { kind: 'reference', table: 'Attendance codes' } } }], edges: [] };
    const versions = flow.versions.map((v) => (v.versionNo === 3 ? { ...v, definition } : v));
    const prepared = prepareRun({ flowName: flow.name, flowVersions: versions, refTables: refs, effectiveDate: '2026-09-30' });
    expect(versionRows(prepared, flow.name, versions, refs)).toEqual([
      { name: 'Monthly timesheet summary v3', range: 'From 01 Jul 2026' },
      { name: 'Attendance codes v2', range: 'From 01 Jul 2026' },
    ]);
  });
  it('an earlier date uses the earlier versions', () => {
    const definition = { schemaVersion: 1, nodes: [{ id: 'l', type: 'lookup_join', settings: { source: { kind: 'reference', table: 'Attendance codes' } } }], edges: [] };
    const versions = flow.versions.map((v) => ({ ...v, definition }));
    const prepared = prepareRun({ flowName: flow.name, flowVersions: versions, refTables: refs, effectiveDate: '2026-05-15' });
    expect(versionRows(prepared, flow.name, versions, refs).map((r) => `${r.name}: ${r.range}`)).toEqual([
      'Monthly timesheet summary v2: 01 Apr 2026 to 30 Jun 2026',
      'Attendance codes v1: 01 Jan 2026 to 30 Jun 2026',
    ]);
  });
});

describe('runDateCheck (T6.10b)', () => {
  const col = [{ name: 'a', type: 'text' as const }];
  const table = (name: string, validTo: string | null): RefTable => ({ name, versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo, columns: col, rows: [] }] });
  const flowVersion = (versionNo: number, validFrom: string, validTo: string | null) => ({ versionNo, validFrom, validTo, status: 'published' as const, definition: { schemaVersion: 1, nodes: [{ id: 'r', type: 'reference_table', settings: { table: 'Limits' } }], edges: [] } });
  const versions = [flowVersion(1, '2026-01-01', '2026-12-31'), flowVersion(2, '2027-01-01', null)];

  it('checks the range of the flow version that the date uses, not the other versions', () => {
    const tables = [table('Limits', '2026-12-31')];
    expect(runDateCheck(versions, '2026-06-01', tables, true)).toEqual([]);
    expect(runDateCheck(versions, '2027-03-01', tables, true)).toEqual([{ table: 'Limits', from: '2027-01-01', to: null }]);
  });
  it('shows the gap also when the date itself is in it (the run stops with its own message)', () => {
    expect(runDateCheck(versions, '2027-03-01', [table('Limits', '2026-12-31')], true)).toHaveLength(1);
  });
  it('has nothing to check when no flow version covers the date', () => {
    expect(runDateCheck(versions, '2025-01-01', [table('Limits', null)], true)).toEqual([]);
    expect(runDateCheck([], '2026-06-01', [], true)).toEqual([]);
  });
  it('leaves out a table with no versions for a person who may not read it yet, and counts it for the admin', () => {
    const empty: RefTable[] = [{ name: 'Limits', versions: [] }];
    expect(runDateCheck(versions, '2026-06-01', empty, false)).toEqual([]);
    expect(runDateCheck(versions, '2026-06-01', empty, true)).toEqual([{ table: 'Limits', from: '2026-01-01', to: '2026-12-31' }]);
  });
});

describe('boundRows (T6.13)', () => {
  const def = (settings: Record<string, unknown>, parameters: unknown[]) =>
    ({ schemaVersion: 3, parameters, nodes: [{ id: 'in', type: 'input_file', label: 'People', settings: { key: 'k', ...settings } }, { id: 'out', type: 'output', settings: { file: { $param: 'file' }, sheet: 'S' } }], edges: [] }) as unknown as FlowDefinition;
  const params = [
    { key: 'sheet', label: 'Sheet', type: 'text', required: true },
    { key: 'row', label: 'Row', type: 'number', required: true },
    { key: 'file', label: 'File', type: 'text', required: true },
  ];
  it('has no rows for a flow without a setting that uses a parameter', () => {
    const plain = { schemaVersion: 3, parameters: params, nodes: [{ id: 'in', type: 'input_file', settings: { key: 'k', sheet: 'Sheet1' } }], edges: [] } as unknown as FlowDefinition;
    expect(boundRows(plain, {})).toEqual([]);
  });
  it('writes "{step}, {setting}: {value}" for each bound setting, in the order of the steps, with the name of the step or its id', () => {
    const rows = boundRows(def({ sheet: { $param: 'sheet' }, headerRow: { $param: 'row' } }, params), { sheet: 'July', row: 2, file: 'Report' });
    expect(rows).toEqual([{ text: 'People, Sheet name: July' }, { text: 'People, Header row: 2' }, { text: 'out, File name: Report' }]);
  });
  it('puts the error under the row of a setting that cannot be resolved, and keeps the other rows', () => {
    const rows = boundRows(def({ sheet: { $param: 'sheet' } }, params), { file: 'Report' });
    expect(rows[0]).toMatchObject({ text: 'People, Sheet name: no value' });
    expect(rows[0]!.error).toContain('needs a value');
    expect(rows[1]).toEqual({ text: 'out, File name: Report' });
  });
});
