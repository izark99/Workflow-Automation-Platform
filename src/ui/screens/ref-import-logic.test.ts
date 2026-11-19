import { describe, expect, it } from 'vitest';
import type { RefTableRecord } from '../../store/types';
import { applyEdits, draftOf, limitProblems, parseHeaderRow, stepOfProblem, tablesWithDraft, targetProblem, whyDisabled } from './ref-import-logic';
import type { ImportState, TargetForm } from './ref-import-logic';

const v = (versionNo: number, status: 'draft' | 'published', validFrom: string, validTo: string | null = null) => ({ versionNo, status, validFrom, validTo, columns: [], rows: [] });
const tables: RefTableRecord[] = [
  { id: 't1', name: 'Limits', description: '', versions: [v(1, 'published', '2026-01-01', '2026-06-30'), v(2, 'published', '2026-07-01'), v(3, 'draft', '2027-01-01')] },
  { id: 't2', name: 'Codes', description: '', versions: [v(1, 'published', '2026-01-01')] },
];
const target = (over: Partial<TargetForm> = {}): TargetForm => ({ kind: 'newTable', name: 'New', tableId: '', validFrom: '', ...over });
const state = (over: Partial<ImportState> = {}): ImportState => ({ hasFile: true, reading: false, headerRow: 1, problems: [], columns: [{ name: 'a', type: 'text' }], target: target(), tables, ...over });

describe('problems by step', () => {
  it('lists each problem under the step that caused it', () => {
    const p = (messageId: Parameters<typeof stepOfProblem>[0]['messageId']) => stepOfProblem({ messageId, params: {} });
    expect(p('refimport.tooManyRows')).toBe('file');
    expect(p('refimport.tooManyColumns')).toBe('file');
    expect(p('refimport.noHeader')).toBe('header');
    expect(p('refimport.noColumns')).toBe('header');
    for (const id of ['refimport.nameEmpty', 'refimport.nameRepeated', 'refimport.notNumber', 'refimport.notBoolean', 'refimport.notDate'] as const) expect(p(id)).toBe('columns');
  });
  it('shows at most 5, then "and n more", counting problems that were not kept', () => {
    expect(limitProblems([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(limitProblems([1, 2, 3, 4, 5, 6, 7])).toEqual({ shown: [1, 2, 3, 4, 5], more: 2 });
    expect(limitProblems([1, 2, 3, 4, 5], 200)).toEqual({ shown: [1, 2, 3, 4, 5], more: 195 });
  });
});

describe('header row', () => {
  it('is a whole number from 1', () => {
    expect(parseHeaderRow('1')).toBe(1);
    expect(parseHeaderRow(' 12 ')).toBe(12);
    for (const bad of ['', '0', '-1', '1.5', 'a']) expect(parseHeaderRow(bad), bad).toBeNull();
  });
});

describe('drafts and targets', () => {
  it('finds the draft of a table, and the tables that have one', () => {
    expect(draftOf(tables[0]!)?.versionNo).toBe(3);
    expect(draftOf(tables[1]!)).toBeUndefined();
    expect(tablesWithDraft(tables).map((t) => t.id)).toEqual(['t1']);
  });
  it('a new table needs a name that no table has, without regard to case', () => {
    expect(targetProblem(target({ name: '  ' }), tables)).toBe('refTables.import.why.targetName');
    expect(targetProblem(target({ name: 'limits' }), tables)).toBe('refTables.import.why.targetNameTaken');
    expect(targetProblem(target({ name: 'Holidays' }), tables)).toBeUndefined();
  });
  it('a new version needs a table and a start that does not overlap', () => {
    expect(targetProblem(target({ kind: 'newVersion' }), tables)).toBe('refTables.import.why.targetTable');
    expect(targetProblem(target({ kind: 'newVersion', tableId: 't2', validFrom: 'x' }), tables)).toBe('refTables.import.why.targetDate');
    expect(targetProblem(target({ kind: 'newVersion', tableId: 't2', validFrom: '2026-01-01' }), tables)).toBe('refTables.import.why.targetDate');
    expect(targetProblem(target({ kind: 'newVersion', tableId: 't2', validFrom: '2027-03-01' }), tables)).toBeUndefined();
  });
  it('replacing a draft needs a table that has one', () => {
    expect(targetProblem(target({ kind: 'replaceDraft', tableId: 't2' }), tables)).toBe('refTables.import.why.targetNoDraft');
    expect(targetProblem(target({ kind: 'replaceDraft', tableId: 't1' }), tables)).toBeUndefined();
  });
});

describe('whyDisabled', () => {
  it('names the first thing that is missing, in the order of the dialog', () => {
    expect(whyDisabled(state({ hasFile: false }))).toBe('refTables.import.why.noFile');
    expect(whyDisabled(state({ reading: true }))).toBe('refTables.import.why.reading');
    expect(whyDisabled(state({ headerRow: null }))).toBe('refTables.import.why.header');
    expect(whyDisabled(state({ problems: [{ messageId: 'refimport.tooManyRows', params: {} }] }))).toBe('refTables.import.why.file');
    expect(whyDisabled(state({ problems: [{ messageId: 'refimport.noHeader', params: {} }] }))).toBe('refTables.import.why.header');
    expect(whyDisabled(state({ problems: [{ messageId: 'refimport.notNumber', params: {} }] }))).toBe('refTables.import.why.columns');
    expect(whyDisabled(state({ columns: [] }))).toBe('refTables.import.why.columns');
    expect(whyDisabled(state({ target: target({ name: '' }) }))).toBe('refTables.import.why.targetName');
  });
  it('is undefined when everything is right', () => {
    expect(whyDisabled(state())).toBeUndefined();
  });
});

describe('applyEdits', () => {
  it('puts the edits of the admin over the names and the guessed types', () => {
    expect(applyEdits(['a', 'b'], ['number', 'text'], { names: { 1: 'Beta' }, types: { 0: 'text' } })).toEqual([
      { name: 'a', type: 'text' },
      { name: 'Beta', type: 'text' },
    ]);
  });
});
