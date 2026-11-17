import { describe, expect, it } from 'vitest';
import { columnLetter, csvRow, headerNames, makeRng, makeRow, STRING_POOL_SIZE, COLUMN_COUNT } from './bench-data.ts';

describe('columnLetter', () => {
  it('maps indexes to Excel letters', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(39)).toBe('AN');
  });
});

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('stays in [0, 1)', () => {
    const r = makeRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('headerNames', () => {
  it('has 40 unique names', () => {
    const h = headerNames();
    expect(h).toHaveLength(COLUMN_COUNT);
    expect(new Set(h).size).toBe(COLUMN_COUNT);
  });
});

describe('makeRow', () => {
  it('has 40 cells of mixed types and is repeatable', () => {
    const r1 = makeRow(makeRng(3), 1);
    const r2 = makeRow(makeRng(3), 1);
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(COLUMN_COUNT);
    expect(r1.some((c) => c.kind === 'str')).toBe(true);
    expect(r1.some((c) => c.kind === 'num')).toBe(true);
    expect(r1.some((c) => c.kind === 'date')).toBe(true);
    for (const c of r1) if (c.kind === 'str') expect(c.index).toBeLessThan(STRING_POOL_SIZE);
  });
});

describe('csvRow', () => {
  it('quotes values that contain commas or quotes', () => {
    expect(csvRow(['a', 'b,c', 'd"e'])).toBe('a,"b,c","d""e"\n');
  });
});
