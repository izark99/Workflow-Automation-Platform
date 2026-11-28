import { describe, expect, it } from 'vitest';
import type { RefTableView } from '../../store/types';
import { columnsOfTable, linkCandidates, linkPreview } from './ref-link-logic';

const text = (name: string) => ({ name, type: 'text' as const });
const table = (id: string, name: string, columns: string[], rows: (string | null)[][], link?: RefTableView['link']): RefTableView => ({
  id, name, description: '', usedBy: [], ...(link ? { link } : {}),
  versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', columns: columns.map(text), rows }],
});

describe('the tables that a table may be linked to', () => {
  const a = table('a', 'Departments', ['dept'], [['Kho']]);
  const b = table('b', 'Costs', ['dept'], [], { tableId: 'a', column: 'dept', keyColumn: 'dept' });
  const c = table('c', 'Budgets', ['dept'], []);
  it('leaves out the table itself and a table that would make a cycle, and says which, listed by name', () => {
    const r = linkCandidates([c, b, a], 'a');
    expect(r.allowed.map((t) => t.name)).toEqual(['Budgets']);
    expect(r.cyclic).toEqual([{ name: 'Costs', chain: 'Departments → Costs → Departments' }]);
  });
  it('allows every table for a table that is being made', () => {
    expect(linkCandidates([c, b, a], null).allowed.map((t) => t.name)).toEqual(['Budgets', 'Costs', 'Departments']);
  });
  it('reads the columns of the latest version', () => {
    expect(columnsOfTable(a).map((x) => x.name)).toEqual(['dept']);
  });
});

describe('what a link adds today', () => {
  const a = table('a', 'Departments', ['dept', 'note'], [['Kho', 'x'], [' QA ', 'y'], ['Kho', 'z'], ['', 'w']]);
  it('counts the distinct values that the table does not hold yet', () => {
    expect(linkPreview(a, 'dept', null, 'dept', '2026-11-17')).toEqual({ hasVersion: true, values: ['Kho', 'QA'], added: 2 });
    const b = table('b', 'Costs', ['dept'], [['Kho']]);
    expect(linkPreview(a, 'dept', b, 'dept', '2026-11-17')).toEqual({ hasVersion: true, values: ['Kho', 'QA'], added: 1 });
  });
  it('says so when the table has no published version, and adds nothing for a column it lacks', () => {
    const draftOnly: RefTableView = { ...a, versions: a.versions.map((v) => ({ ...v, status: 'draft' as const })) };
    expect(linkPreview(draftOnly, 'dept', null, 'dept', '2026-11-17')).toEqual({ hasVersion: false, values: [], added: 0 });
    expect(linkPreview(a, 'nope', null, 'dept', '2026-11-17')).toEqual({ hasVersion: true, values: [], added: 0 });
  });
});
