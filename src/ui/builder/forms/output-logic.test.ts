import { describe, expect, it } from 'vitest';
import { appendFromSettings, checkSql, outputFromSettings, outputMissing, outputToSettings, validateSheetName } from './output-logic';

describe('Output settings', () => {
  const saved = { file: 'Result', format: 'xlsx', sheet: 'Summary', columns: ['a', 'b'], sort: [{ column: 'a', direction: 'desc' }, { expression: 'IF([a] > 1, 1, 2)' }], numberLikeText: ['code'] };
  it('reads and writes the same settings', () => {
    expect(outputToSettings(outputFromSettings(saved), {}).settings).toEqual(saved);
  });
  it('writes only what is set: no columns when all are written, no sort, no number-like columns, no sheet for csv', () => {
    const v = outputFromSettings({ file: 'R', format: 'xlsx', sheet: 'S' });
    expect(v.allColumns).toBe(true);
    expect(outputToSettings(v, {}).settings).toEqual({ file: 'R', format: 'xlsx', sheet: 'S' });
    const csv = outputToSettings({ ...v, format: 'csv' }, { sheet: 'S' }).settings!;
    expect(csv).toEqual({ file: 'R', format: 'csv' });
  });
  it('the column list is written only when "all columns" is off and the list is not empty', () => {
    const v = outputFromSettings({ file: 'R', sheet: 'S', columns: ['a'] });
    expect(v.allColumns).toBe(false);
    expect(outputToSettings({ ...v, columns: [] }, {}).settings).not.toHaveProperty('columns');
    expect(outputMissing({ ...v, columns: [] })[0]).toMatch(/Add at least one column/);
  });
  it('an empty file name or a bad sheet name gives errors and no settings', () => {
    const v = outputFromSettings({ file: 'R', sheet: 'S' });
    const r = outputToSettings({ ...v, file: ' ', sheet: 'a:b' }, {});
    expect(r.settings).toBeUndefined();
    expect(r.errors.file).toMatch(/file name is empty/);
    expect(r.errors.sheet).toMatch(/none of \[ \] : \* \? \//);
  });
  it('a csv file needs no sheet name', () => {
    expect(outputToSettings({ ...outputFromSettings({ file: 'R' }), format: 'csv', sheet: '' }, {}).errors).toEqual({});
  });
  it('validates sheet names like the engine', () => {
    expect(validateSheetName('Summary')).toBeUndefined();
    expect(validateSheetName('')).toMatch(/empty/);
    expect(validateSheetName('x'.repeat(32))).toBeDefined();
    expect(validateSheetName("'quoted")).toBeDefined();
    expect(validateSheetName('a/b')).toBeDefined();
    expect(validateSheetName('x'.repeat(31))).toBeUndefined();
  });
  it('sort rows without a column or formula are ignored and reported', () => {
    const v = outputFromSettings({ file: 'R', sheet: 'S', sort: [{ column: 'a' }] });
    v.sort.push({ kind: 'column', column: '', expression: '', direction: 'asc' });
    expect((outputToSettings(v, {}).settings!.sort as unknown[]).length).toBe(1);
    expect(outputMissing(v)[0]).toMatch(/sort row has no column/);
  });
});

describe('Append and SQL', () => {
  it('append matches by name unless it says position', () => {
    expect(appendFromSettings({})).toBe('name');
    expect(appendFromSettings({ match: 'position' })).toBe('position');
    expect(appendFromSettings({ match: 'bogus' })).toBe('name');
  });
  it('the SQL check says empty, refused or allowed', () => {
    expect(checkSql('  ').kind).toBe('empty');
    expect(checkSql('SELECT * FROM in1').kind).toBe('ok');
    const bad = checkSql('DROP TABLE x');
    expect(bad.kind).toBe('refused');
    expect(bad.message.length).toBeGreaterThan(10);
  });
});
