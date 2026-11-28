// The rows of a sort, shared by the Output form and the Sort form: a column or a formula, and a direction.
export interface SortRow {
  kind: 'column' | 'formula';
  column: string;
  expression: string;
  direction: 'asc' | 'desc';
}

export const emptySortRow = (): SortRow => ({ kind: 'column', column: '', expression: '', direction: 'asc' });

/** The rows of the form from the list that is stored (`sort` of an Output step, `keys` of a Sort step). */
export function sortRowsFromList(list: unknown): SortRow[] {
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[]).map((k): SortRow => ({
    kind: typeof k.expression === 'string' ? 'formula' : 'column',
    column: typeof k.column === 'string' ? k.column : '',
    expression: typeof k.expression === 'string' ? k.expression : '',
    direction: k.direction === 'desc' ? 'desc' : 'asc',
  }));
}

/** A row that has its column or its formula. */
export const sortRowDone = (k: SortRow): boolean => (k.kind === 'column' ? k.column.trim() !== '' : k.expression.trim() !== '');

/** The list to store: only the finished rows, and a direction only when it is not the default. */
export function sortRowsToList(rows: readonly SortRow[]): Record<string, unknown>[] {
  return rows.filter(sortRowDone).map((k) => {
    const o: Record<string, unknown> = k.kind === 'column' ? { column: k.column.trim() } : { expression: k.expression };
    if (k.direction === 'desc') o.direction = 'desc';
    return o;
  });
}
