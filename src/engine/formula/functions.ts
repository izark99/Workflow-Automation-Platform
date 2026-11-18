import type { ColumnType } from '../types';
import type { Expr } from './ast';

/** SQL of an expression and its type. `bare` marks a plain column reference, whose blank cell counts as 0 or empty text. */
export interface Compiled {
  sql: string;
  type: ColumnType;
  bare?: boolean;
}

export interface FunctionContext {
  call: Extract<Expr, { kind: 'call' }>;
  effectiveDate: string;
  /** The compiled arguments, in order. */
  args: readonly Compiled[];
  /**
   * SQL of argument `i` as `type`. Throws a `FormulaError` at the argument when its type is another one.
   * A blank column cell becomes 0, empty text or FALSE; a date stays blank.
   */
  arg(i: number, type: ColumnType): string;
  /** Like `arg`, but a blank stays blank (NULL). For functions that ignore blanks, such as MIN and AND. */
  raw(i: number, type: ColumnType): string;
  /** Throws a `FormulaError` at argument `i`, or at the whole call when `i` is not given. */
  error(message: string, i?: number): never;
}

export interface FunctionSpec {
  /** Smallest and largest number of arguments. Use `Infinity` for no upper limit. */
  min: number;
  max: number;
  compile(ctx: FunctionContext): Compiled;
}

export type FunctionRegistry = Record<string, FunctionSpec>;
