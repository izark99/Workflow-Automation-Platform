import { describe, expect, it } from 'vitest';
import { ambiguousLayouts, clearLayouts, type Layout } from '../../../../scripts/lib/layout-fixtures.ts';
import { xlsxBytes, type FixtureCell } from '../../../../scripts/lib/refimport-fixtures.ts';
import { analyzeFile, applyProposal, MAX_SHEETS, type FileAnalysis, type NamedBlob } from './analyze-file';
import { proposalLines, stopText } from './proposal-lines';

const named = (bytes: Uint8Array, name: string): NamedBlob => Object.assign(new Blob([bytes as BlobPart]), { name });
const ofLayout = (l: Layout): NamedBlob => named(l.file.bytes, l.file.name);
const book = (sheets: Record<string, FixtureCell[][]>): NamedBlob => named(new Uint8Array(xlsxBytes(Object.entries(sheets).map(([name, rows]) => ({ name, rows })))), 'book.xlsx');
const table = (rows: number, cols: number): FixtureCell[][] => [Array.from({ length: cols }, (_, i) => `H${i}`), ...Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `v${r}.${c}`))];
const text: FixtureCell[][] = [['Notes'], ['Nothing to see here']];
const done = async (f: NamedBlob): Promise<FileAnalysis> => {
  const r = await analyzeFile(f);
  if (r === 'cancelled') throw new Error('cancelled');
  return r;
};

describe('analyzeFile', () => {
  it('reads an xlsx file whose first sheet holds the table: that sheet is chosen, with high confidence', async () => {
    const layout = clearLayouts().find((l) => l.name === 'title-and-footer (xlsx)')!;
    const r = await done(ofLayout(layout));
    expect(r.sheets).toEqual(['Report']);
    expect(r.sheet).toMatchObject({ value: 'Report', confidence: 'high' });
    expect(r.analysis.headerRow?.value).toBe(layout.truth!.headerRow);
    expect(r.grid.rows.length).toBeGreaterThan(10);
  });
  it('a csv file has no sheets, and no sheet is proposed', async () => {
    const layout = clearLayouts().find((l) => l.name === 'title-and-footer (csv)')!;
    const r = await done(ofLayout(layout));
    expect(r.sheets).toEqual([]);
    expect(r.sheet).toBeUndefined();
    expect(r.analysis.found).toBe(true);
    expect(r.analysis.headerRow?.value).toBe(layout.truth!.headerRow);
  });
  it('when the first sheet holds no table, the sheet with the largest table is chosen, with medium confidence and the reason', async () => {
    const r = await done(book({ Notes: text, Small: table(3, 3), Big: table(30, 6) }));
    expect(r.sheet).toMatchObject({ value: 'Big', confidence: 'medium' });
    expect(r.sheet!.reason.id).toBe('engine.layoutSheetLargest');
    expect(r.analysis.region).toMatchObject({ lastColumn: 6, lastRow: 31 });
  });
  it('when the first sheet holds a table the others are not looked at', async () => {
    const r = await done(book({ First: table(3, 3), Other: table(40, 8) }));
    expect(r.sheet?.value).toBe('First');
  });
  it('a workbook with no table in any sheet gives no table and no sheet', async () => {
    const r = await done(book({ A: text, B: text }));
    expect(r.analysis.found).toBe(false);
    expect(r.sheet).toBeUndefined();
    expect(proposalLines(r)).toEqual([]);
  });
  it('looks at no more than 20 sheets', async () => {
    const sheets: Record<string, FixtureCell[][]> = {};
    for (let i = 0; i < MAX_SHEETS + 3; i++) sheets[`S${i}`] = i === MAX_SHEETS + 1 ? table(50, 5) : text;
    const r = await done(book(sheets));
    expect(r.sheet).toBeUndefined(); // the table is in the 22nd sheet, which is not looked at
  });
  it('can be cancelled: an aborted signal gives "cancelled" and no result', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await analyzeFile(book({ A: table(3, 3) }), { signal: controller.signal })).toBe('cancelled');
  });
  it('a file that is not an xlsx or a csv file says what to do', async () => {
    await expect(analyzeFile(named(new Uint8Array([1, 2, 3]), 'notes.docx'))).rejects.toThrow(/\.xlsx or \.csv/);
  });
});

describe('applyProposal', () => {
  it('writes the region settings of the proposal over the step, and keeps what the proposal does not touch', async () => {
    const layout = clearLayouts().find((l) => l.name === 'later-row-and-column (xlsx)')!;
    const r = await done(ofLayout(layout));
    const out = applyProposal({ key: 'people', skipRows: 1, rowNumberColumn: 'n', headerRow: 9, firstColumn: 'Z', stopAt: { kind: 'row', row: 3 }, sheet: 'Old' }, r);
    expect(out).toMatchObject({ key: 'people', skipRows: 1, rowNumberColumn: 'n', sheet: 'Report', headerRow: 4, firstColumn: 'C', lastColumn: 'H', stopAt: { kind: 'marker', text: 'Page', match: 'starts_with' } });
    expect(out.expect).toEqual(['Code', 'Label', 'Group', 'Amount', 'Day', 'Text day']);
  });
  it('removes what the step had and the proposal leaves out, because that is a default (a header at row 1, the first column A)', async () => {
    const r = await done(book({ S: table(3, 3) }));
    const out = applyProposal({ key: 'k', headerRow: 5, firstColumn: 'D', ignoreRows: [{ column: 'a', text: 'b' }], fillDown: ['H0'] }, r);
    expect('headerRow' in out).toBe(false);
    expect('firstColumn' in out).toBe(false);
    expect('ignoreRows' in out).toBe(false);
    expect('fillDown' in out).toBe(false);
    expect(out.lastColumn).toBe('C');
  });
  it('a setting that uses a parameter keeps its parameter', async () => {
    const layout = clearLayouts().find((l) => l.name === 'later-row-and-column (xlsx)')!;
    const r = await done(ofLayout(layout));
    const out = applyProposal({ key: 'k', sheet: { $param: 'sheet' }, headerRow: { $param: 'row' } }, r);
    expect(out.sheet).toEqual({ $param: 'sheet' });
    expect(out.headerRow).toEqual({ $param: 'row' });
    expect(out.firstColumn).toBe('C');
  });
  it('removes a sheet from the step of a csv file, and changes nothing when no table was found', async () => {
    const csv = await done(ofLayout(clearLayouts().find((l) => l.name === 'title-and-footer (csv)')!));
    expect('sheet' in applyProposal({ key: 'k', sheet: 'Old' }, csv)).toBe(false);
    const none = await done(book({ A: text }));
    const settings = { key: 'k', headerRow: 3 };
    expect(applyProposal(settings, none)).toBe(settings);
  });
});

describe('proposalLines', () => {
  it('lists the sheet, header row, columns, stop, required columns and fill down, each with its confidence and reason', async () => {
    const layout = clearLayouts().find((l) => l.name === 'merged-cells (xlsx)')!;
    const lines = proposalLines(await done(ofLayout(layout)));
    expect(lines.map((l) => l.id)).toEqual(['sheet', 'headerRow', 'firstColumn', 'lastColumn', 'stopAt', 'expect', 'fillDown']);
    expect(lines.map((l) => l.label)).toEqual(['Sheet name', 'Header row', 'First column of the table', 'Last column of the table', 'Stop reading at', 'Columns the file must have', 'Fill down these columns']);
    const by = Object.fromEntries(lines.map((l) => [l.id, l]));
    expect(by.sheet).toMatchObject({ value: 'Report', confidence: 'high' });
    expect(by.headerRow).toMatchObject({ value: '3', confidence: 'high' });
    expect(by.firstColumn!.value).toBe('A');
    expect(by.lastColumn!.value).toBe('F');
    expect(by.stopAt!.value).toBe('A row whose column Code starts with "Signature"');
    expect(by.stopAt!.reason).toContain('Row 11 starts with "Signature"');
    expect(by.expect!.value).toBe('Code, Label, Group, Amount, Day, Text day');
    expect(by.fillDown).toMatchObject({ value: 'Group', confidence: 'medium' });
    expect(by.fillDown!.reason).toMatch(/3 of 6 rows have no value in "Group"/);
  });
  it('a csv file has no sheet line, and nothing to fill down says None without a badge', async () => {
    const lines = proposalLines(await done(ofLayout(clearLayouts().find((l) => l.name === 'title-and-footer (csv)')!)));
    expect(lines.some((l) => l.id === 'sheet')).toBe(false);
    expect(lines.find((l) => l.id === 'fillDown')).toMatchObject({ value: 'None' });
    expect(lines.find((l) => l.id === 'fillDown')!.confidence).toBeUndefined();
  });
  it('lists the rows to ignore when there are any', async () => {
    const lines = proposalLines(await done(ofLayout(clearLayouts().find((l) => l.name === 'totals-row (xlsx)')!)));
    expect(lines.find((l) => l.id === 'ignoreRows')).toMatchObject({ value: 'Label: Subtotal', confidence: 'medium' });
  });
  it('an ambiguous file has low-confidence lines, and the reasons say why', async () => {
    const layout = ambiguousLayouts().find((l) => l.name === 'two-tables (xlsx)')!;
    const lines = proposalLines(await done(ofLayout(layout)));
    expect(lines.find((l) => l.id === 'headerRow')).toMatchObject({ confidence: 'low' });
    expect(lines.find((l) => l.id === 'headerRow')!.reason).toMatch(/holds 2 tables/);
    expect(lines.find((l) => l.id === 'stopAt')!.confidence).toBe('low');
  });
  it('a stop rule in words', () => {
    expect(stopText({ kind: 'end' })).toBe('The end of the sheet');
    expect(stopText({ kind: 'blank_rows', count: 1 })).toBe('The first empty row');
    expect(stopText({ kind: 'blank_rows', count: 3 })).toBe('3 empty rows in a row');
    expect(stopText({ kind: 'row', row: 40 })).toBe('Row 40');
    expect(stopText({ kind: 'marker', text: 'Prepared by', match: 'starts_with' })).toBe('A row that starts with "Prepared by"');
    expect(stopText({ kind: 'marker', text: 'x', match: 'equals', column: 'Label' })).toBe('A row whose column Label is "x"');
  });
});
