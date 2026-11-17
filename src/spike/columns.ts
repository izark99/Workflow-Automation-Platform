// Pure helpers for the spike: turn rows read by SheetJS into typed columns.
// The spike worker feeds these columns to DuckDB as Arrow chunks.

export type ColumnKind = 'number' | 'string' | 'date';
export type Cell = unknown;

/** Header cells to unique, non-empty column names. */
export function sanitizeHeader(cells: Cell[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    const base = c === undefined || c === null || String(c).trim() === '' ? `column_${i + 1}` : String(c);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/** Kind of each column, taken from the first data row. Anything unclear is a string. */
export function columnKinds(firstRow: Cell[]): ColumnKind[] {
  return firstRow.map((c) => {
    if (typeof c === 'number') return 'number';
    if (c instanceof Date) return 'date';
    return 'string';
  });
}

/** Rows to one array per column. Values that do not fit the column kind become null. */
export function rowsToColumns(rows: Cell[][], kinds: ColumnKind[]): (number | string | Date | null)[][] {
  const cols: (number | string | Date | null)[][] = kinds.map(() => new Array(rows.length));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < kinds.length; c++) {
      const v = row[c];
      const kind = kinds[c]!;
      let out: number | string | Date | null = null;
      if (v !== undefined && v !== null) {
        if (kind === 'number') out = typeof v === 'number' ? v : null;
        else if (kind === 'date') out = v instanceof Date ? v : null;
        else out = String(v);
      }
      cols[c]![r] = out;
    }
  }
  return cols;
}
