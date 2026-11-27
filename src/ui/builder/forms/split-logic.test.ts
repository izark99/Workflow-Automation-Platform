import { describe, expect, it } from 'vitest';
import { nameClashes, splitFromSettings, splitMissing, splitToSettings } from './split-logic';

describe('Split column form logic', () => {
  it('starts from the defaults of the engine', () => {
    expect(splitFromSettings({})).toEqual({ column: '', cut: 'space', separator: '', names: [], rest: 'last', trim: true, keepOriginal: false });
    expect(splitFromSettings({ column: 'Name', cut: 'last_space', names: ['A', 'B'], rest: 'drop', trim: false, keepOriginal: true })).toMatchObject({ cut: 'last_space', rest: 'drop', trim: false, keepOriginal: true });
    expect(splitFromSettings({ cut: 'dash' }).cut).toBe('space');
  });
  it('keeps the separator only for the cut at a given text, and other settings as they were', () => {
    const v = splitFromSettings({ column: ' Name ', cut: 'text', separator: ' - ', names: ['A'] });
    expect(splitToSettings(v, { x: 1 })).toMatchObject({ x: 1, column: 'Name', cut: 'text', separator: ' - ' });
    expect(splitToSettings({ ...v, cut: 'comma' }, { separator: 'old' })).not.toHaveProperty('separator');
  });
  it('says what is still missing', () => {
    expect(splitMissing(splitFromSettings({}))).toHaveLength(2);
    expect(splitMissing(splitFromSettings({ column: 'C', cut: 'text', names: ['A'] }))).toEqual(['Type the text to cut at.']);
    expect(splitMissing(splitFromSettings({ column: 'C', names: ['A'] }))).toEqual([]);
  });
  it('finds a new name that another column has, and frees the name of the original when it is dropped', () => {
    const v = splitFromSettings({ column: 'Name', names: ['Name', 'Id', 'New'] });
    expect(nameClashes(v, ['Id', 'Name'])).toEqual(['Id']);
    expect(nameClashes({ ...v, keepOriginal: true }, ['Id', 'Name'])).toEqual(['Name', 'Id']);
    expect(nameClashes(v, null)).toEqual([]);
  });
});
