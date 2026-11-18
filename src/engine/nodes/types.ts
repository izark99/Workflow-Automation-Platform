import type { FlowNode, NodeType } from '../flow/types';
import type { Column, LoadedTable, QueryResult } from '../types';

export interface CompileContext {
  node: FlowNode;
  /** Tables on the input handles of the node, by handle name. */
  inputs: Readonly<Record<string, LoadedTable>>;
  /** Loaded input tables, by logical key. */
  inputTables: Readonly<Record<string, LoadedTable>>;
  /** Reference tables valid on the effective date, by name. */
  refTables: Readonly<Record<string, LoadedTable>>;
  /** ISO date, for example `2026-09-30`. */
  effectiveDate: string;
  /** Runs a query on the tables of this run. For nodes whose output columns depend on values, such as Pivot. */
  query(sql: string): Promise<QueryResult>;
}

export interface CompiledOutput {
  /** A SELECT statement. The engine stores its result as a table. */
  sql: string;
  /** Exact column names and types of the result, in order. */
  columns: Column[];
}

/** One module per node type: settings in, SQL out. Throws `EngineError` for bad settings. */
export interface NodeModule {
  type: NodeType;
  compile(ctx: CompileContext): Record<string, CompiledOutput> | Promise<Record<string, CompiledOutput>>;
}

export type NodeRegistry = Partial<Record<NodeType, NodeModule>>;
