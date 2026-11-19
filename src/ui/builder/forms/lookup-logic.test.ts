import { describe, expect, it } from 'vitest';
import type { RefTable } from '../../../engine/versions';
import { groupByFromSettings, groupByMissing, groupByToSettings, lookupFromSettings, lookupMissing, lookupToSettings, refTableColumns, refTableUnreadable } from './lookup-logic';

describe('Lookup settings', () => {
  const saved = { source: { kind: 'reference', table: 'OT limits' }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }, { column: 'note' }], onNoMatch: 'drop' };
  it('reads settings into values with the engine defaults', () => {
    expect(lookupFromSettings(saved)).toEqual({ source: { kind: 'reference', table: 'OT limits' }, keys: [{ left: 'kind', right: 'period' }], bring: [{ column: 'limit_hours', as: 'limit' }, { column: 'note', as: '' }], onNoMatch: 'drop' });
    expect(lookupFromSettings({})).toEqual({ source: { kind: 'node' }, keys: [], bring: [], onNoMatch: 'blank' });
    expect(lookupFromSettings({ onNoMatch: 'bogus' }).onNoMatch).toBe('blank');
  });
  it('round trips, writes only complete rows, and writes "as" only when it differs', () => {
    expect(lookupToSettings(lookupFromSettings(saved), {})).toEqual(saved);
    const v = lookupFromSettings(saved);
    v.keys.push({ left: 'half', right: '' });
    v.bring.push({ column: '', as: 'x' }, { column: 'same', as: 'same' });
    expect(lookupToSettings(v, { other: 1 })).toEqual({ ...saved, other: 1, bring: [...saved.bring, { column: 'same' }] });
  });
  it('says what is still missing', () => {
    expect(lookupMissing(lookupFromSettings({}), false)).toHaveLength(3);
    expect(lookupMissing(lookupFromSettings({}), true)).toHaveLength(2);
    expect(lookupMissing(lookupFromSettings(saved), false)).toEqual([]);
    expect(lookupMissing({ source: { kind: 'node' }, keys: [{ left: 'a', right: 'b' }], bring: [{ column: 'c', as: '' }], onNoMatch: 'blank' }, false)[0]).toMatch(/right input/);
  });
  it('takes the columns of the newest version of a reference table', () => {
    const tables: RefTable[] = [{ name: 'T', versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: '2026-06-30', columns: [{ name: 'a', type: 'text' }], rows: [] }, { versionNo: 2, validFrom: '2026-07-01', validTo: null, columns: [{ name: 'a', type: 'text' }, { name: 'b', type: 'number' }], rows: [] }] }];
    expect(refTableColumns(tables, 'T')).toEqual(['a', 'b']);
    expect(refTableColumns(tables, 'missing')).toBeNull();
  });
});

describe('Group by settings', () => {
  const saved = { groupBy: ['dept'], aggregations: [{ fn: 'sum', column: 'hours', as: 'total' }, { fn: 'count' }, { fn: 'max', column: 'age' }] };
  it('reads and writes the same settings', () => {
    expect(groupByToSettings(groupByFromSettings(saved), {})).toEqual(saved);
  });
  it('the result name is written only when it differs from the engine default', () => {
    const v = groupByFromSettings({ groupBy: [], aggregations: [{ fn: 'sum', column: 'h', as: 'sum_h' }, { fn: 'count', as: 'count' }] });
    expect(v.aggregations.map((a) => a.as)).toEqual(['', '']);
    expect(groupByToSettings({ groupBy: [], aggregations: [{ fn: 'sum', column: 'h', as: 'sum_h' }] }, {}).aggregations).toEqual([{ fn: 'sum', column: 'h' }]);
  });
  it('an aggregation other than count needs a column; an incomplete row is kept in the form but not written', () => {
    const v = { groupBy: ['d'], aggregations: [{ fn: 'sum' as const, column: '', as: '' }, { fn: 'count' as const, column: '', as: '' }] };
    expect(groupByToSettings(v, {}).aggregations).toEqual([{ fn: 'count' }]);
    expect(groupByMissing(v)).toEqual(['Choose the column to sum.']);
  });
  it('asks for a group column or an aggregation when both are empty', () => {
    expect(groupByMissing({ groupBy: [], aggregations: [] })).toEqual(['Add a group column or an aggregation.']);
    expect(groupByMissing({ groupBy: ['a'], aggregations: [] })).toEqual([]);
  });
});

describe('refTableUnreadable', () => {
  const v = { versionNo: 1, validFrom: '2026-01-01', validTo: null, columns: [{ name: 'a', type: 'text' as const }], rows: [] };
  const tables: RefTable[] = [{ name: 'Open', versions: [v] }, { name: 'Closed', versions: [] }];
  it('is true only for a table that exists with no readable version', () => {
    expect(refTableUnreadable(tables, 'Closed')).toBe(true);
    expect(refTableUnreadable(tables, 'Open')).toBe(false);
    expect(refTableUnreadable(tables, 'Nope')).toBe(false);
  });
});
