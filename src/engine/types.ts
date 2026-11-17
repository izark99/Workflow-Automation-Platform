/** Shared data types of the engine. No React, no Supabase. */

export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface Column {
  /** Case-sensitive. Formulas write it in square brackets: [OT hours]. */
  name: string;
  type: ColumnType;
}

/** Cell values that cross the engine boundary. Dates are ISO strings (`2026-09-30`). */
export type Cell = string | number | boolean | null;

export interface TableData {
  columns: Column[];
  rows: Cell[][];
}

/** A table that exists in the SQL engine. */
export interface LoadedTable {
  relation: string;
  columns: Column[];
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
}

/** The only door to DuckDB. A Node build runs the unit tests, a Web Worker build runs in the browser. */
export interface SqlRunner {
  exec(sql: string): Promise<void>;
  query(sql: string): Promise<QueryResult>;
  /** Makes a file readable by SQL under this name, for example by `read_csv`. Does not copy a File. */
  registerFile(name: string, data: Blob): Promise<void>;
  /** Stops the running query, if the runner can. */
  cancel(): Promise<void>;
  close(): Promise<void>;
}

export type EngineErrorCode =
  | 'invalid_flow'
  | 'unsupported_node'
  | 'missing_input_table'
  | 'missing_reference_table'
  | 'invalid_settings'
  | 'invalid_formula'
  | 'file_too_large'
  | 'file_read_failed'
  | 'unknown_column'
  | 'node_failed'
  | 'cancelled';

/** Every message says what failed and what to do next. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly nodeId: string | undefined;

  constructor(code: EngineErrorCode, message: string, nodeId?: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.nodeId = nodeId;
  }
}
