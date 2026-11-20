import { describe, expect, it } from 'vitest';
import { columnLetters, columnNumber, MAX_COLUMN } from './region';

describe('columnNumber', () => {
  it('reads a letter, in any case, as Excel numbers columns', () => {
    expect(columnNumber('A')).toBe(1);
    expect(columnNumber('z')).toBe(26);
    expect(columnNumber('AA')).toBe(27);
    expect(columnNumber('AZ')).toBe(52);
    expect(columnNumber('xfd')).toBe(MAX_COLUMN);
    expect(MAX_COLUMN).toBe(16384);
  });
  it('reads a number, or text of digits, as the column number', () => {
    expect(columnNumber(3)).toBe(3);
    expect(columnNumber('3')).toBe(3);
    expect(columnNumber(' 12 ')).toBe(12);
    expect(columnNumber(MAX_COLUMN)).toBe(MAX_COLUMN);
  });
  it('refuses what is not a column', () => {
    for (const bad of ['', ' ', 'XFE', 'A1', '1A', 0, -1, 1.5, MAX_COLUMN + 1, '0', true, null, undefined, {}, 'é']) expect(columnNumber(bad), String(bad)).toBeUndefined();
  });
});

describe('columnLetters', () => {
  it('is the inverse of columnNumber', () => {
    expect(columnLetters(1)).toBe('A');
    expect(columnLetters(26)).toBe('Z');
    expect(columnLetters(27)).toBe('AA');
    expect(columnLetters(MAX_COLUMN)).toBe('XFD');
    for (let n = 1; n <= 1000; n += 7) expect(columnNumber(columnLetters(n))).toBe(n);
  });
});

import { textMatches } from './region';

describe('textMatches', () => {
  it('contains, starts with and equals are not case sensitive', () => {
    expect(textMatches('Prepared by: A. Maker', 'prepared by', 'contains')).toBe(true);
    expect(textMatches('Prepared by: A. Maker', 'PREPARED BY', 'starts_with')).toBe(true);
    expect(textMatches('  Prepared by', 'prepared', 'starts_with')).toBe(true);
    expect(textMatches('Signature', ' signature ', 'equals')).toBe(true);
    expect(textMatches('Signatures', 'signature', 'equals')).toBe(false);
    expect(textMatches('Now Prepared by', 'prepared by', 'starts_with')).toBe(false);
    expect(textMatches('Người lập', 'người', 'starts_with')).toBe(true);
  });
});
