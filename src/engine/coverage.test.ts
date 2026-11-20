import { describe, expect, it } from 'vitest';
import { coverageGaps, dateCheck, type RefTable, type VersionRange } from './versions';

const v = (versionNo: number, validFrom: string, validTo: string | null, status?: 'draft' | 'published'): VersionRange => ({ versionNo, validFrom, validTo, status });
const range = (validFrom: string, validTo: string | null) => ({ validFrom, validTo });

describe('coverageGaps', () => {
  it('a table with no published version is one gap for the whole range, also with an open end', () => {
    expect(coverageGaps(range('2027-01-01', '2027-12-31'), [])).toEqual([{ from: '2027-01-01', to: '2027-12-31' }]);
    expect(coverageGaps(range('2027-01-01', null), [])).toEqual([{ from: '2027-01-01', to: null }]);
  });
  it('drafts do not count, a version with no status does', () => {
    expect(coverageGaps(range('2027-01-01', '2027-12-31'), [v(1, '2026-01-01', null, 'draft')])).toEqual([{ from: '2027-01-01', to: '2027-12-31' }]);
    expect(coverageGaps(range('2027-01-01', '2027-12-31'), [v(1, '2026-01-01', null)])).toEqual([]);
    expect(coverageGaps(range('2027-01-01', '2027-12-31'), [v(1, '2026-01-01', null, 'published')])).toEqual([]);
  });
  it('a version that ends before the range leaves the rest of the range open', () => {
    expect(coverageGaps(range('2027-01-01', '2027-12-31'), [v(1, '2026-01-01', '2026-12-31')])).toEqual([{ from: '2027-01-01', to: '2027-12-31' }]);
    expect(coverageGaps(range('2027-01-01', null), [v(1, '2026-01-01', '2026-12-31')])).toEqual([{ from: '2027-01-01', to: null }]);
  });
  it('versions that touch leave no gap, and a day between two versions is a gap of one day', () => {
    expect(coverageGaps(range('2026-01-01', '2026-12-31'), [v(1, '2026-01-01', '2026-06-30'), v(2, '2026-07-01', null)])).toEqual([]);
    expect(coverageGaps(range('2026-01-01', '2026-12-31'), [v(1, '2026-01-01', '2026-06-29'), v(2, '2026-07-01', null)])).toEqual([{ from: '2026-06-30', to: '2026-06-30' }]);
  });
  it('finds a gap at the start, in the middle and at the end, in the order of the days', () => {
    const versions = [v(2, '2026-06-01', '2026-06-30'), v(1, '2026-03-01', '2026-03-31')];
    expect(coverageGaps(range('2026-02-01', '2026-08-31'), versions)).toEqual([
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-04-01', to: '2026-05-31' },
      { from: '2026-07-01', to: '2026-08-31' },
    ]);
  });
  it('an open end of the range after the last version is an open gap', () => {
    expect(coverageGaps(range('2026-01-01', null), [v(1, '2026-01-01', '2026-06-30')])).toEqual([{ from: '2026-07-01', to: null }]);
  });
  it('a version that is open ended covers every day from its start', () => {
    expect(coverageGaps(range('2026-01-01', null), [v(1, '2026-03-01', null)])).toEqual([{ from: '2026-01-01', to: '2026-02-28' }]);
  });
  it('versions outside the range and overlapping versions do not make or hide gaps wrongly', () => {
    expect(coverageGaps(range('2026-05-01', '2026-05-31'), [v(1, '2026-01-01', '2026-03-31'), v(2, '2026-09-01', null)])).toEqual([{ from: '2026-05-01', to: '2026-05-31' }]);
    expect(coverageGaps(range('2026-01-01', '2026-12-31'), [v(1, '2026-01-01', '2026-08-31'), v(2, '2026-06-01', '2026-12-31')])).toEqual([]);
    expect(coverageGaps(range('2026-01-01', '2026-12-31'), [v(1, '2026-01-01', '2026-12-31'), v(2, '2026-03-01', '2026-04-01')])).toEqual([]);
  });
  it('a range of one day', () => {
    expect(coverageGaps(range('2026-05-05', '2026-05-05'), [v(1, '2026-05-05', '2026-05-05')])).toEqual([]);
    expect(coverageGaps(range('2026-05-05', '2026-05-05'), [v(1, '2026-05-06', null)])).toEqual([{ from: '2026-05-05', to: '2026-05-05' }]);
  });
});

describe('dateCheck', () => {
  const table = (name: string, versions: VersionRange[]): RefTable => ({ name, versions: versions.map((x) => ({ ...x, columns: [], rows: [] })) });
  const flow = { nodes: [{ type: 'reference_table', settings: { table: 'Limits' } }, { type: 'lookup_join', settings: { source: { kind: 'reference', table: 'Codes' } } }, { type: 'pivot', settings: { columns: { from: 'reference', table: 'Gone' } } }] };
  const tables = [table('Limits', [v(1, '2026-01-01', '2026-12-31')]), table('Codes', [v(1, '2026-01-01', null)]), table('Unused', [])];
  it('lists the gaps of every table that the flow reads, with the table name, and leaves out tables that are not in the list', () => {
    expect(dateCheck(flow, range('2027-01-01', '2027-06-30'), tables)).toEqual([{ table: 'Limits', from: '2027-01-01', to: '2027-06-30' }]);
  });
  it('is empty when nothing is missing', () => {
    expect(dateCheck(flow, range('2026-02-01', '2026-06-30'), tables)).toEqual([]);
  });
  it('skipEmpty leaves out a table that has no versions at all (a table this person cannot read yet)', () => {
    const f = { nodes: [{ type: 'reference_table', settings: { table: 'Unused' } }] };
    expect(dateCheck(f, range('2026-01-01', null), tables)).toEqual([{ table: 'Unused', from: '2026-01-01', to: null }]);
    expect(dateCheck(f, range('2026-01-01', null), tables, { skipEmpty: true })).toEqual([]);
  });
});
