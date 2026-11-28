import { describe, expect, it } from 'vitest';
import { comparableColumns, compareFromSettings, compareMissing, compareToSettings } from './compare-logic';

describe('Compare form logic', () => {
  it('starts with no key and every column compared', () => {
    expect(compareFromSettings({})).toEqual({ keys: [], all: true, compare: [] });
    expect(compareFromSettings({ keys: [{ new: 'A', old: 'B' }, null], compare: ['X'] })).toEqual({ keys: [{ new: 'A', old: 'B' }, { new: '', old: '' }], all: false, compare: ['X'] });
  });
  it('writes an empty list for "all columns", keeps key rows as typed, and other settings', () => {
    const v = { keys: [{ new: 'A', old: '' }], all: false, compare: ['X', 'Y'] };
    expect(compareToSettings(v, { other: 1 })).toEqual({ other: 1, keys: [{ new: 'A', old: '' }], compare: ['X', 'Y'] });
    expect(compareToSettings({ ...v, all: true }, {}).compare).toEqual([]);
  });
  it('says what is missing, with the number of the key', () => {
    expect(compareMissing({ keys: [], all: true, compare: [] })).toEqual(['Add at least one key.']);
    expect(compareMissing({ keys: [{ new: 'A', old: '' }, { new: '', old: 'B' }], all: true, compare: [] })).toEqual(['Key 1 needs a column of the old table.', 'Key 2 needs a column of the new table.']);
    expect(compareMissing({ keys: [{ new: 'A', old: 'B' }], all: true, compare: [] })).toEqual([]);
  });
  it('offers the columns that both tables have, without the keys of either table', () => {
    const v = { keys: [{ new: 'Id', old: 'Code' }], all: false, compare: [] };
    expect(comparableColumns(v, ['Id', 'Hours', 'Extra'], ['Code', 'Hours', 'Gone', 'Id'])).toEqual(['Hours']);
    expect(comparableColumns(v, null, ['A'])).toBeNull();
    expect(comparableColumns(v, ['A'], null)).toBeNull();
  });
});
