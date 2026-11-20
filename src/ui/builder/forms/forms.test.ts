import { describe, expect, it } from 'vitest';
import { parseNameList, toFormValues, validateInputForm } from './input-file-logic';

describe('Input file form values', () => {
  it('reads settings into text values with the defaults of the engine', () => {
    expect(toFormValues({ key: 'timesheet' })).toMatchObject({ key: 'timesheet', sheet: '', headerRow: '1', skipRows: '0', fillDown: '', addRowNumber: false, rowNumberColumn: 'row_number' });
    expect(toFormValues({ key: 'a', sheet: 'Data', headerRow: 3, skipRows: 1, fillDown: ['Employee ID', 'Full name'], rowNumberColumn: 'n' })).toMatchObject({
      key: 'a', sheet: 'Data', headerRow: '3', skipRows: '1', fillDown: 'Employee ID, Full name', addRowNumber: true, rowNumberColumn: 'n',
    });
  });
  it('splits a list of names at commas, trims, and drops empty names and repeats', () => {
    expect(parseNameList(' Employee ID ,Full name,, Employee ID ')).toEqual(['Employee ID', 'Full name']);
    expect(parseNameList('')).toEqual([]);
  });
});

describe('Input file validation', () => {
  const ok = toFormValues({ key: 'timesheet' });
  it('builds settings with numbers, and leaves out what is empty or off', () => {
    const r = validateInputForm({ ...ok, headerRow: ' 3 ', skipRows: '1', sheet: ' Data ', fillDown: 'A, B' }, [], { key: 'timesheet', other: 'kept' });
    expect(r.settings).toEqual({ key: 'timesheet', other: 'kept', headerRow: 3, skipRows: 1, sheet: 'Data', fillDown: ['A', 'B'] });
    const plain = validateInputForm(ok, [], { key: 'timesheet', sheet: 'Old', fillDown: ['X'], rowNumberColumn: 'n' }).settings!;
    expect('sheet' in plain || 'fillDown' in plain || 'rowNumberColumn' in plain).toBe(false);
  });
  it('adds the row number column only when ticked, with its name', () => {
    expect(validateInputForm({ ...ok, addRowNumber: true, rowNumberColumn: ' n ' }, [], {}).settings?.rowNumberColumn).toBe('n');
  });
  it('says what is wrong and what to do for each field, and gives no settings', () => {
    const r = validateInputForm({ ...ok, key: ' ', headerRow: '0', skipRows: '-1', addRowNumber: true, rowNumberColumn: '' }, [], {});
    expect(r.settings).toBeUndefined();
    expect(r.errors.key).toMatch(/empty.*Type the name/);
    expect(r.errors.headerRow).toMatch(/"0" is not a row number.*1 or more/);
    expect(r.errors.skipRows).toMatch(/"-1".*0 or more/);
    expect(r.errors.rowNumberColumn).toMatch(/no name/);
  });
  it('refuses a name that another Input file step already uses', () => {
    const r = validateInputForm(ok, ['timesheet'], {});
    expect(r.errors.key).toMatch(/already uses the name "timesheet"/);
  });
  it('refuses a decimal or a text as a row number', () => {
    expect(validateInputForm({ ...ok, headerRow: '1.5' }, [], {}).errors.headerRow).toBeDefined();
    expect(validateInputForm({ ...ok, skipRows: 'two' }, [], {}).errors.skipRows).toBeDefined();
  });
});

describe('Input file form: the region (T6.15b)', () => {
  const ok = toFormValues({ key: 'k' });
  const settingsOf = (patch: Partial<typeof ok>, previous: Record<string, unknown> = {}) => validateInputForm({ ...ok, ...patch }, [], previous);

  it('starts from the defaults of the engine: no first or last column, the end of the sheet, nothing to ignore or require', () => {
    expect(ok).toMatchObject({ firstColumn: '', lastColumn: '', stopKind: 'end', blankCount: '1', markerText: '', markerMatch: 'contains', markerColumn: '', stopRow: '', ignoreRows: [], expect: [] });
  });
  it('reads the saved region back into the form', () => {
    const v = toFormValues({ key: 'k', firstColumn: 'C', lastColumn: 6, stopAt: { kind: 'marker', text: 'Prepared by', match: 'starts_with', column: 'Label' }, ignoreRows: [{ column: 'Label', text: 'Subtotal' }], expect: ['Code'] });
    expect(v).toMatchObject({ firstColumn: 'C', lastColumn: '6', stopKind: 'marker', markerText: 'Prepared by', markerMatch: 'starts_with', markerColumn: 'Label', ignoreRows: [{ column: 'Label', text: 'Subtotal' }], expect: ['Code'] });
    expect(toFormValues({ key: 'k', stopAt: { kind: 'blank_rows', count: 3 } })).toMatchObject({ stopKind: 'blank_rows', blankCount: '3' });
    expect(toFormValues({ key: 'k', stopAt: { kind: 'row', row: 40 } })).toMatchObject({ stopKind: 'row', stopRow: '40' });
  });
  it('writes nothing for the defaults, so an old step stays as it was', () => {
    const r = settingsOf({}, { key: 'k', headerRow: 1, firstColumn: 'B', stopAt: { kind: 'row', row: 3 }, ignoreRows: [{ column: 'a', text: 'b' }], expect: ['x'] });
    for (const k of ['firstColumn', 'lastColumn', 'stopAt', 'ignoreRows', 'expect']) expect(k in r.settings!).toBe(false);
  });
  it('writes the columns as a letter in capitals or as a number', () => {
    expect(settingsOf({ firstColumn: ' c ', lastColumn: '6' }).settings).toMatchObject({ firstColumn: 'C', lastColumn: 6 });
  });
  it('refuses a column that is not one, and a last column before the first, with what to do', () => {
    expect(settingsOf({ firstColumn: 'A1' }).errors.firstColumn).toMatch(/"A1" is not a column.*letter such as C/);
    expect(settingsOf({ lastColumn: '0' }).errors.lastColumn).toMatch(/not a column/);
    expect(settingsOf({ firstColumn: 'D', lastColumn: 'B' }).errors.lastColumn).toMatch(/before the first column/);
    expect(settingsOf({ firstColumn: 'D', lastColumn: 'B' }).settings).toBeUndefined();
  });
  it('writes each way to stop with its own settings', () => {
    expect(settingsOf({ stopKind: 'blank_rows', blankCount: '2' }).settings?.stopAt).toEqual({ kind: 'blank_rows', count: 2 });
    expect(settingsOf({ stopKind: 'marker', markerText: ' Prepared by ', markerMatch: 'equals' }).settings?.stopAt).toEqual({ kind: 'marker', text: 'Prepared by', match: 'equals' });
    expect(settingsOf({ stopKind: 'marker', markerText: 'x', markerColumn: ' Label ' }).settings?.stopAt).toEqual({ kind: 'marker', text: 'x', match: 'contains', column: 'Label' });
    expect(settingsOf({ stopKind: 'row', stopRow: '40' }).settings?.stopAt).toEqual({ kind: 'row', row: 40 });
  });
  it('refuses a stop rule that is not complete, and only for the kind that is chosen', () => {
    expect(settingsOf({ stopKind: 'blank_rows', blankCount: '11' }).errors.blankCount).toMatch(/1 to 10/);
    expect(settingsOf({ stopKind: 'blank_rows', blankCount: '0' }).errors.blankCount).toBeDefined();
    expect(settingsOf({ stopKind: 'marker', markerText: ' ' }).errors.markerText).toMatch(/text of the row is empty/);
    expect(settingsOf({ stopKind: 'row', stopRow: 'x' }).errors.stopRow).toMatch(/not a row number/);
    // A wrong value in a field that is not in use is not an error.
    expect(settingsOf({ stopKind: 'end', blankCount: '99', markerText: '', stopRow: 'x' }).errors).toEqual({});
  });
  it('writes the rows to ignore and the columns the file must have, and refuses a row with a column or a text missing', () => {
    expect(settingsOf({ ignoreRows: [{ column: ' Label ', text: ' Subtotal ' }], expect: ['Code', 'Amount'] }).settings).toMatchObject({ ignoreRows: [{ column: 'Label', text: 'Subtotal' }], expect: ['Code', 'Amount'] });
    expect(settingsOf({ ignoreRows: [{ column: 'Label', text: '' }] }).errors.ignoreRows).toMatch(/Row 1 of the rows to ignore needs a column and a text/);
    expect(settingsOf({ ignoreRows: [{ column: 'a', text: 'b' }, { column: '', text: 'x' }] }).errors.ignoreRows).toMatch(/Row 2/);
  });
  it('keeps the settings that the form does not edit, and what the parser of the engine accepts', () => {
    const r = settingsOf({ firstColumn: 'B', stopKind: 'blank_rows', blankCount: '1', expect: ['x'] }, { key: 'k', other: 1 });
    expect(r.settings).toMatchObject({ other: 1, firstColumn: 'B', stopAt: { kind: 'blank_rows', count: 1 }, expect: ['x'] });
  });
});
