import { describe, expect, it } from 'vitest';
import { duplicateSources, emptyRow, looksLikeGrid, mergeColumns, parsePaste, rowsFromSettings, settingsFromRows } from './column-mapping-logic';

describe('rows and settings', () => {
  it('reads settings into rows with the engine defaults', () => {
    expect(rowsFromSettings({ columns: [{ source: 'a' }, { source: 'b', keep: false, name: 'B2', type: 'number' }, { source: 'c', name: 'c' }] })).toEqual([
      { source: 'a', keep: true, name: '', type: '' },
      { source: 'b', keep: false, name: 'B2', type: 'number' },
      { source: 'c', keep: true, name: '', type: '' },
    ]);
    expect(rowsFromSettings({})).toEqual([]);
  });
  it('writes only what differs from the default, and leaves out rows without a source', () => {
    const r = settingsFromRows(
      [
        { source: ' a ', keep: true, name: '', type: '' },
        { source: 'b', keep: false, name: 'B2', type: 'date' },
        { source: 'c', keep: true, name: 'c', type: '' },
        emptyRow(),
      ],
      { other: 1 },
    );
    expect(r.settings).toEqual({ other: 1, columns: [{ source: 'a' }, { source: 'b', keep: false, name: 'B2', type: 'date' }, { source: 'c' }] });
  });
  it('a source listed twice gives an error and no settings', () => {
    const rows = [{ ...emptyRow(), source: 'a' }, { ...emptyRow(), source: 'a ' }];
    expect(duplicateSources(rows)).toEqual(['a']);
    const r = settingsFromRows(rows, {});
    expect(r.settings).toBeUndefined();
    expect(r.error).toMatch(/"a" is listed more than once.*Remove one/);
  });
  it('round trips', () => {
    const settings = { columns: [{ source: 'a', name: 'A', type: 'text' }, { source: 'b', keep: false }] };
    expect(settingsFromRows(rowsFromSettings(settings), {}).settings).toEqual(settings);
  });
});

describe('paste from Excel', () => {
  it('reads source, new name, type and keep from tab separated lines (also with Windows line ends)', () => {
    const r = parsePaste('code\tCode\ttext\tyes\r\nwork_day_value\t\tNumber\t\r\nnote\t\t\tno\r\n');
    expect(r).toEqual({
      ok: true,
      rows: [
        { source: 'code', keep: true, name: 'Code', type: 'text' },
        { source: 'work_day_value', keep: true, name: '', type: 'number' },
        { source: 'note', keep: false, name: '', type: '' },
      ],
    });
  });
  it('a single column of names works, and a header line is skipped', () => {
    expect(parsePaste('Column\tNew name\tType\tKeep\na\nb')).toEqual({ ok: true, rows: [{ source: 'a', keep: true, name: '', type: '' }, { source: 'b', keep: true, name: '', type: '' }] });
  });
  it('"as is" means no type; a new name equal to the source means no rename', () => {
    expect(parsePaste('a\ta\tAs is')).toEqual({ ok: true, rows: [{ source: 'a', keep: true, name: '', type: '' }] });
  });
  it('refuses the whole paste with the row and what to do: empty text, no source, bad type, bad keep, repeated source, header only', () => {
    expect((parsePaste('  \n') as { message: string }).message).toMatch(/nothing to paste/);
    expect((parsePaste('a\n\tNew') as { message: string }).message).toMatch(/Row 2.*no source column/);
    expect((parsePaste('a\t\tnumber\nb\t\tdecimal') as { message: string }).message).toMatch(/Row 2.*"decimal" is not a type.*text, number, date or boolean/);
    expect((parsePaste('a\t\t\tmaybe') as { message: string }).message).toMatch(/Row 1.*"maybe".*yes or no/);
    expect((parsePaste('a\nb\na') as { message: string }).message).toMatch(/"a" appears more than once/);
    expect((parsePaste('Column\tNew name') as { message: string }).message).toMatch(/header row but no columns/);
  });
  it('recognises text that came from a grid', () => {
    expect(looksLikeGrid('a\tb')).toBe(true);
    expect(looksLikeGrid('a\nb')).toBe(true);
    expect(looksLikeGrid('a\n')).toBe(false);
    expect(looksLikeGrid('just one value')).toBe(false);
  });
});

describe('load columns', () => {
  it('adds the columns that are not listed, keeps the settings of the others, and drops empty rows', () => {
    const rows = [{ source: 'a', keep: false, name: 'A', type: 'text' as const }, emptyRow()];
    const r = mergeColumns(rows, ['a', 'b', 'c']);
    expect(r.added).toBe(2);
    expect(r.rows.map((x) => [x.source, x.keep, x.name])).toEqual([['a', false, 'A'], ['b', true, ''], ['c', true, '']]);
    expect(mergeColumns(r.rows, ['a', 'b', 'c']).added).toBe(0);
  });
});
