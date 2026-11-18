import { describe, expect, it } from 'vitest';
import { columnKinds, rowsToColumns, sanitizeHeader } from './columns';

describe('sanitizeHeader', () => {
  it('keeps names, fills blanks and makes duplicates unique', () => {
    expect(sanitizeHeader(['id', '', 'id', 'x'])).toEqual(['id', 'column_2', 'id_2', 'x']);
  });
  it('turns non-string cells into text', () => {
    expect(sanitizeHeader([1, null])).toEqual(['1', 'column_2']);
  });
});

describe('columnKinds', () => {
  it('reads the kind of each column from the first data row', () => {
    const d = new Date('2023-03-15T00:00:00Z');
    expect(columnKinds([1.5, 'a', d, true])).toEqual(['number', 'string', 'date', 'string']);
  });
  it('treats empty cells as strings', () => {
    expect(columnKinds([undefined, null])).toEqual(['string', 'string']);
  });
});

describe('rowsToColumns', () => {
  it('turns rows into one array per column and fills gaps with null', () => {
    const d = new Date('2023-03-15T00:00:00Z');
    const cols = rowsToColumns(
      [
        [1, 'a', d],
        [2, undefined],
      ],
      ['number', 'string', 'date'],
    );
    expect(cols[0]).toEqual([1, 2]);
    expect(cols[1]).toEqual(['a', null]);
    expect(cols[2]).toEqual([d, null]);
  });
  it('coerces values that do not match the column kind', () => {
    const cols = rowsToColumns([[1, 'x'], ['oops', 5]], ['number', 'string']);
    expect(cols[0]).toEqual([1, null]);
    expect(cols[1]).toEqual(['x', '5']);
  });
});
