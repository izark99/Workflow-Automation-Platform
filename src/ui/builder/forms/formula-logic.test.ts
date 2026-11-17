import { describe, expect, it } from 'vitest';
import type { Column } from '../../../engine/types';
import { checkFormula, columnReference, functionInsert, insertAtCursor } from './formula-logic';

const cols: Column[] = [{ name: 'OT hours', type: 'number' }, { name: 'name', type: 'text' }, { name: 'day', type: 'date' }];
const date = '2026-09-30';

describe('checkFormula', () => {
  it('empty and badly written formulas say what to do', () => {
    expect(checkFormula('  ', null, date)).toMatchObject({ kind: 'empty' });
    const bad = checkFormula('[OT hours] >', cols, date);
    expect(bad.kind).toBe('syntax_error');
    expect(bad.message).toMatch(/^Character \d+:/);
  });
  it('without columns it checks only the writing and says how to check more', () => {
    const r = checkFormula('[OT hours] > 4', null, date);
    expect(r.kind).toBe('unchecked');
    expect(r.message).toMatch(/Load the columns/);
  });
  it('with columns it gives the result type', () => {
    expect(checkFormula('[OT hours] * 2', cols, date)).toMatchObject({ kind: 'valid', type: 'number', message: 'Formula is valid. Result type: number.' });
    expect(checkFormula('[name] & "!"', cols, date)).toMatchObject({ kind: 'valid', type: 'text' });
    expect(checkFormula('[OT hours] > 4', cols, date)).toMatchObject({ kind: 'valid', type: 'boolean' });
    expect(checkFormula('[day] + 1', cols, date)).toMatchObject({ kind: 'valid', type: 'date' });
    expect(checkFormula('EFFECTIVE_DATE()', cols, date)).toMatchObject({ kind: 'valid', type: 'date' });
  });
  it('an unknown column or a wrong type is invalid, with the character', () => {
    const unknown = checkFormula('[OT hour] + 1', cols, date);
    expect(unknown.kind).toBe('invalid');
    expect(unknown.message).toMatch(/^Character 1:.*OT hour/);
    expect(checkFormula('[name] * 2', cols, date).kind).toBe('invalid');
    expect(checkFormula('VLOOKUP(1)', cols, date).kind).toBe('invalid');
  });
  it('a result of the wrong type is invalid when a type is expected', () => {
    const r = checkFormula('[OT hours] + 1', cols, date, 'boolean');
    expect(r.kind).toBe('invalid');
    expect(r.message).toMatch(/gives a number, but this step needs true or false/);
    expect(checkFormula('[OT hours] > 1', cols, date, 'boolean').kind).toBe('valid');
  });
});

describe('inserting', () => {
  it('puts text at the cursor or over the selection and moves the cursor', () => {
    expect(insertAtCursor('abc', 1, 1, 'XY')).toEqual({ text: 'aXYbc', caret: 3 });
    expect(insertAtCursor('abc', 0, 3, 'IF()', 1)).toEqual({ text: 'IF()', caret: 3 });
    expect(insertAtCursor('abc', 99, 99, '!')).toEqual({ text: 'abc!', caret: 4 });
    expect(insertAtCursor('abc', 2, 1, '-').text).toBe('ab-c'); // a backwards selection is read as an empty one
  });
  it('a function goes in as NAME() with the cursor inside, or after the brackets when it has no arguments', () => {
    expect(functionInsert('IF(condition, a, b)')).toEqual({ insert: 'IF()', caretBack: 1 });
    expect(functionInsert('EFFECTIVE_DATE()')).toEqual({ insert: 'EFFECTIVE_DATE()', caretBack: 0 });
  });
  it('writes a column reference, doubling a closing bracket', () => {
    expect(columnReference('OT hours')).toBe('[OT hours]');
    expect(columnReference('a]b')).toBe('[a]]b]');
    expect(checkFormula(columnReference('a]b'), [{ name: 'a]b', type: 'number' }], date).kind).toBe('valid');
  });
});
