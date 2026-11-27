import { describe, expect, it } from 'vitest';
import { parseN, topNFromSettings, topNMissingBy, topNToSettings } from './top-n-logic';

describe('Top N form logic', () => {
  it('starts from the defaults and reads stored settings', () => {
    expect(topNFromSettings({})).toMatchObject({ n: '10', order: 'largest', byKind: 'column', byColumn: '', groupBy: [] });
    expect(topNFromSettings({ n: 3, order: 'smallest', by: { expression: '[A]*2' }, groupBy: ['Dept'] })).toMatchObject({ n: '3', order: 'smallest', byKind: 'formula', byExpression: '[A]*2', groupBy: ['Dept'] });
  });
  it('accepts a whole number from 1 to 1,000,000 (with a thousands comma) and says what to type otherwise', () => {
    expect(parseN('10')).toEqual({ n: 10 });
    expect(parseN(' 1,000 ')).toEqual({ n: 1000 });
    expect(parseN('1000000').n).toBe(1_000_000);
    for (const bad of ['', '0', '-3', '1.5', 'ten', '1000001']) expect(parseN(bad).error, bad).toMatch(/whole number from 1 to 1,000,000/);
  });
  it('saves a column or a formula, drops the order column for the first rows, and keeps other settings', () => {
    const base = topNFromSettings({});
    expect(topNToSettings({ ...base, n: '5', byColumn: 'Hours' }, { x: 1 }).settings).toEqual({ x: 1, n: 5, order: 'largest', groupBy: [], by: { column: 'Hours' } });
    expect(topNToSettings({ ...base, byKind: 'formula', byExpression: '[A]+1' }, {}).settings?.by).toEqual({ expression: '[A]+1' });
    expect(topNToSettings({ ...base, order: 'first', byColumn: 'Hours' }, { by: { column: 'old' } }).settings).not.toHaveProperty('by');
  });
  it('keeps the old settings when N is wrong, and knows when the order column is missing', () => {
    const base = topNFromSettings({});
    expect(topNToSettings({ ...base, n: 'x' }, {})).toEqual({ error: expect.stringMatching(/whole number/) });
    expect(topNMissingBy(base)).toBe(true);
    expect(topNMissingBy({ ...base, byColumn: 'A' })).toBe(false);
    expect(topNMissingBy({ ...base, order: 'first' })).toBe(false);
  });
});
