import { describe, expect, it } from 'vitest';
import { checkRange, checkRowCap } from './checks';
import { StoreError } from './types';

describe('checkRange', () => {
  it('accepts a range and an open end', () => {
    expect(() => checkRange('2026-01-01', '2026-12-31')).not.toThrow();
    expect(() => checkRange('2026-01-01', null)).not.toThrow();
    expect(() => checkRange('2026-01-01', '2026-01-01')).not.toThrow();
  });

  it('refuses text that is not a date, and an end before the start', () => {
    expect(() => checkRange('soon', null)).toThrowError('"soon" is not a date. Pick a start date in the date picker.');
    expect(() => checkRange('2026-01-01', '2026-13-40')).toThrowError('"2026-13-40" is not a date. Pick an end date or leave it empty.');
    try {
      checkRange('2026-06-30', '2026-06-01');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(StoreError);
      expect((e as StoreError).code).toBe('invalid');
      expect((e as StoreError).message).toBe('The end date 1 Jun 2026 is before the start date 30 Jun 2026. Change one of them.');
    }
  });
});

describe('checkRowCap', () => {
  it('allows 50,000 rows and refuses more, with the counts in the message', () => {
    expect(() => checkRowCap(50_000)).not.toThrow();
    expect(() => checkRowCap(50_001)).toThrowError(
      'A reference table version holds at most 50,000 rows, and this one has 50,001. Remove rows and save again.',
    );
  });
});
