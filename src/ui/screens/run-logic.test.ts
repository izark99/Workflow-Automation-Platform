import { describe, expect, it } from 'vitest';
import { prepareRun } from '../../engine/versions';
import type { RefTable } from '../../engine/versions';
import { seedSnapshot } from '../../store/seed';
import { addStep, emptyDefinition } from '../builder/graph';
import { inputsOf, progressText, sheetLabel, sizeLabel, versionRows } from './run-logic';

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
