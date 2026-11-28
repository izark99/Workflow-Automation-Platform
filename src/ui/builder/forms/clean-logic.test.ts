import { describe, expect, it } from 'vitest';
import { cleanDoesNothing, cleanFromSettings, cleanMissing, cleanToSettings } from './clean-logic';

describe('Clean text form logic', () => {
  it('starts from the defaults of the engine', () => {
    expect(cleanFromSettings({})).toEqual({ columns: [], trim: true, collapse: true, nonPrinting: false, caseMode: 'keep', removeMarks: false, target: 'replace', suffix: '_clean' });
    expect(cleanFromSettings({ columns: ['A'], trim: false, caseMode: 'proper', removeMarks: true, target: 'suffix', suffix: '_x' })).toMatchObject({ trim: false, caseMode: 'proper', target: 'suffix', suffix: '_x' });
    expect(cleanFromSettings({ caseMode: 'title' }).caseMode).toBe('keep');
  });
  it('keeps the suffix only for new columns, and other settings as they were', () => {
    const v = cleanFromSettings({ columns: ['A'], target: 'suffix', suffix: '_x' });
    expect(cleanToSettings(v, { other: 1 })).toMatchObject({ other: 1, columns: ['A'], target: 'suffix', suffix: '_x' });
    expect(cleanToSettings({ ...v, target: 'replace' }, { suffix: 'old' })).not.toHaveProperty('suffix');
  });
  it('says what is still missing', () => {
    expect(cleanMissing(cleanFromSettings({}))).toEqual(['Add at least one text column to clean.']);
    expect(cleanMissing(cleanFromSettings({ columns: ['A'], trim: false, collapse: false }))).toEqual(['Turn on at least one thing to clean, or choose a letter case.']);
    expect(cleanMissing(cleanFromSettings({ columns: ['A'], target: 'suffix', suffix: ' ' }))).toEqual(['Type the suffix of the new columns.']);
    expect(cleanMissing(cleanFromSettings({ columns: ['A'] }))).toEqual([]);
    expect(cleanDoesNothing(cleanFromSettings({ trim: false, collapse: false, caseMode: 'upper' }))).toBe(false);
  });
});
