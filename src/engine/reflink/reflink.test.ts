import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deleteRefusal, distinctValues, draftStart, keysOf, linkRefusal, newValues, noticeValues, notInSource, publishRefusal, versionInEffect } from './index';
import type { LinkTable } from './index';
import type { Cell } from '../types';

// The same list of cases is read by the database test of migration 21 (T9.12), so the two implementations cannot drift apart.
const cases = JSON.parse(readFileSync(new URL('../../../supabase/tests/ref-link-cases.json', import.meta.url), 'utf8')) as Record<string, any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any -- the cases of several kinds are read from a JSON file

describe('the shared cases', () => {
  it('has every kind of case', () => {
    expect(Object.keys(cases).sort()).toEqual(['deleteRefusal', 'distinct', 'draftStart', 'linkRefusal', 'newValues', 'publishRefusal', 'versionInEffect']);
  });
  for (const c of cases.distinct!) it(`distinct values: ${c.name}`, () => expect(distinctValues(c.input as Cell[])).toEqual(c.expected));
  for (const c of cases.newValues!) it(`new values: ${c.name}`, () => expect(newValues(c.values, new Set<string>(c.keys))).toEqual(c.expected));
  for (const c of cases.versionInEffect!) it(`version in effect: ${c.name}`, () => expect(versionInEffect(c.versions, c.today)?.versionNo ?? null).toBe(c.expected));
  for (const c of cases.draftStart!) it(`start of the draft: ${c.name}`, () => expect(draftStart(c.aStart, c.last, c.today)).toBe(c.expected));
  for (const c of cases.linkRefusal!) it(`link: ${c.name}`, () => expect(linkRefusal(c.tables as LinkTable[], c.b, c.a, c.column, c.keyColumn)).toEqual(c.expected));
  for (const c of cases.publishRefusal!) it(`publish of A: ${c.name}`, () => expect(publishRefusal(c.a, c.columns, c.linked)).toEqual(c.expected));
  for (const c of cases.deleteRefusal!) it(`delete: ${c.name}`, () => expect(deleteRefusal(c.a, c.tables)).toEqual(c.expected));
});

describe('the keys of a table', () => {
  it('are the trimmed texts of the key column in every version, draft or published, without blanks', () => {
    const cols = [{ name: 'dept', type: 'text' as const }, { name: 'x', type: 'text' as const }];
    const keys = keysOf([{ columns: cols, rows: [[' Kho', 'a'], [null, 'b']] }, { columns: cols, rows: [['QA', 'c'], ['  ', 'd']] }, { columns: [{ name: 'other' }], rows: [['zzz']] }], 'dept');
    expect([...keys].sort()).toEqual(['Kho', 'QA']);
  });
});

describe('the notice and the values that left A', () => {
  it('shows the first three values and how many more', () => {
    expect(noticeValues(['a', 'b'])).toEqual({ first: ['a', 'b'], more: 0 });
    expect(noticeValues(['a', 'b', 'c', 'd', 'e'])).toEqual({ first: ['a', 'b', 'c'], more: 2 });
  });
  it('lists the keys of B that A does not hold any more, and deletes nothing', () => {
    expect(notInSource(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});
