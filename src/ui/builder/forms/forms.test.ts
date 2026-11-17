import { describe, expect, it } from 'vitest';
import { checkFormulaSyntax } from './formula-check';
import { parseNameList, toFormValues, validateInputForm } from './input-file-logic';

describe('Input file form values', () => {
  it('reads settings into text values with the defaults of the engine', () => {
    expect(toFormValues({ key: 'timesheet' })).toEqual({ key: 'timesheet', sheet: '', headerRow: '1', skipRows: '0', fillDown: '', addRowNumber: false, rowNumberColumn: 'row_number' });
    expect(toFormValues({ key: 'a', sheet: 'Data', headerRow: 3, skipRows: 1, fillDown: ['Employee ID', 'Full name'], rowNumberColumn: 'n' })).toEqual({
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

describe('formula syntax check', () => {
  it('accepts a formula that is written correctly', () => {
    expect(checkFormulaSyntax('[OT hours] > 4')).toEqual({ ok: true });
    expect(checkFormulaSyntax('IF([a] = "x", 1, 2)')).toEqual({ ok: true });
  });
  it('an empty formula says what to write', () => {
    const r = checkFormulaSyntax('  ');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/empty.*for example/);
  });
  it('a mistake gives the character position and the reason', () => {
    const r = checkFormulaSyntax('[OT hours > 4');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/^Character \d+:/);
    const r2 = checkFormulaSyntax('1 +');
    expect(r2.ok).toBe(false);
  });
});
