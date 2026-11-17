import type { Cell, Column, TableData } from './types';

/** Quotes an identifier. Always use it: column names hold spaces, digits and capitals. */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function quoteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const SQL_TYPE = { text: 'VARCHAR', number: 'DOUBLE', date: 'DATE', boolean: 'BOOLEAN' } as const;

export function sqlType(type: Column['type']): string {
  return SQL_TYPE[type];
}

function literal(value: Cell, type: Column['type']): string {
  if (value === null) return 'NULL';
  if (type === 'date') return `DATE ${quoteString(String(value))}`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return quoteString(value);
}

const INSERT_CHUNK = 500;

export function createTableStatement(relation: string, columns: Column[]): string {
  const cols = columns.map((c) => `${quoteIdent(c.name)} ${sqlType(c.type)}`).join(', ');
  return `CREATE OR REPLACE TABLE ${quoteIdent(relation)} (${cols})`;
}

/** INSERT statements for rows held in memory, in chunks. For small batches only. */
export function insertRowsStatements(relation: string, columns: Column[], rows: Cell[][]): string[] {
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const values = rows
      .slice(i, i + INSERT_CHUNK)
      .map((row) => `(${columns.map((c, j) => literal(row[j] ?? null, c.type)).join(', ')})`)
      .join(', ');
    statements.push(`INSERT INTO ${quoteIdent(relation)} VALUES ${values}`);
  }
  return statements;
}

/** SQL statements that create and fill a table from rows held in memory. For small tables only. */
export function createTableStatements(relation: string, data: TableData): string[] {
  return [createTableStatement(relation, data.columns), ...insertRowsStatements(relation, data.columns, data.rows)];
}

/** Select list that returns cells in the boundary format: numbers as DOUBLE, dates as ISO text. */
export function boundarySelectList(columns: Column[]): string {
  return columns
    .map((c) => {
      const id = quoteIdent(c.name);
      if (c.type === 'number') return `CAST(${id} AS DOUBLE) AS ${id}`;
      if (c.type === 'date') return `strftime(${id}, '%Y-%m-%d') AS ${id}`;
      return id;
    })
    .join(', ');
}
