import { describe, expect, it } from 'vitest';
import type { RefTable } from '../../../engine/versions';
import { referenceTableInfo, versionRange } from './reference-table-logic';

const cols = [{ name: 'code', type: 'text' as const }];
const v = (versionNo: number, validFrom: string, validTo: string | null, status?: 'draft' | 'published') => ({ versionNo, validFrom, validTo, status, columns: cols, rows: [] });
const limits: RefTable = { name: 'limits', versions: [v(1, '2026-01-01', '2026-06-30'), v(2, '2026-07-01', '2026-12-31')] };
const info = (tables: RefTable[], name: string, date: string) => referenceTableInfo(tables, name, date);

describe('versionRange', () => {
  it('writes the dates as the screens do, with and without an end', () => {
    expect(versionRange('2026-07-01', '2026-12-31')).toBe('from 1 Jul 2026 to 31 Dec 2026');
    expect(versionRange('2026-07-01', null)).toBe('from 1 Jul 2026');
  });
});

describe('referenceTableInfo', () => {
  it('has no table yet', () => {
    expect(info([limits], '', '2026-09-30')).toEqual({ kind: 'none' });
  });
  it('names the version of the test date and its dates', () => {
    expect(info([limits], 'limits', '2026-09-30')).toEqual({ kind: 'ready', name: 'limits', versionNo: 2, range: 'from 1 Jul 2026 to 31 Dec 2026', columns: cols });
    expect(info([limits], 'limits', '2026-03-01')).toMatchObject({ kind: 'ready', versionNo: 1 });
  });
  it('a draft that covers the date is used, as in a test run', () => {
    const t: RefTable = { name: 'limits', versions: [v(1, '2026-01-01', '2026-06-30'), v(2, '2026-07-01', null, 'draft')] };
    expect(info([t], 'limits', '2026-09-30')).toMatchObject({ kind: 'ready', versionNo: 2 });
  });
  it('a name that is not in the list is missing', () => {
    expect(info([limits], 'gone', '2026-09-30')).toEqual({ kind: 'missing', name: 'gone' });
  });
  it('a table whose rows this person cannot read yet is unreadable', () => {
    expect(info([{ name: 'limits', versions: [] }], 'limits', '2026-09-30')).toEqual({ kind: 'unreadable', name: 'limits' });
  });
  it('a date that no version covers gives the engine message and still lists the newest columns', () => {
    const r = info([limits], 'limits', '2027-02-01');
    expect(r.kind).toBe('no_version');
    if (r.kind === 'no_version') {
      expect(r.message).toContain('limits');
      expect(r.message).toContain('1 Feb 2027');
      expect(r.columns).toEqual(cols);
    }
  });
  it('overlapping versions are reported as a problem of the date', () => {
    const t: RefTable = { name: 'limits', versions: [v(1, '2026-01-01', '2026-10-15'), v(2, '2026-10-01', null)] };
    const r = info([t], 'limits', '2026-10-05');
    expect(r.kind).toBe('no_version');
    if (r.kind === 'no_version') expect(r.message).toMatch(/both cover/);
  });
});
