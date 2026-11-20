import { engineText } from './messages';
import type { EngineMessageId, MessageParams } from './messages';
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
  | 'no_version'
  | 'invalid_versions'
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
  /** Id of the message in the catalog and its parameters. Without an id the English `message` is shown. */
  readonly messageId: string | undefined;
  readonly params: Record<string, string | number> | undefined;

  constructor(code: EngineErrorCode, message: string, nodeId?: string, detail?: { messageId: string; params?: Record<string, string | number> }) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.nodeId = nodeId;
    this.messageId = detail?.messageId;
    this.params = detail?.params;
  }
}

/** Something that the run did, and that the person should know: it does not stop the run. */
export interface EngineWarning {
  messageId: string;
  params: Record<string, string | number>;
  /** The English text, filled with the parameters. The screens show the text of their language from the id. */
  message: string;
  nodeId?: string;
}

/** A warning with a message id: the message is the English template filled with the parameters. */
export function warning(messageId: EngineMessageId, params: MessageParams = {}, nodeId?: string): EngineWarning {
  return { messageId, params, message: engineText(messageId, params), ...(nodeId === undefined ? {} : { nodeId }) };
}

/** An engine error with a message id: the message is the English template filled with the parameters. */
export function coded(code: EngineErrorCode, messageId: EngineMessageId, params: MessageParams = {}, nodeId?: string): EngineError {
  return new EngineError(code, engineText(messageId, params), nodeId, { messageId, params });
}
