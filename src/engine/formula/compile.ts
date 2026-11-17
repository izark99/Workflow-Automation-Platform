import { requireColumn } from '../nodes/columns';
import { numberToTextSql, quoteIdent, quoteString } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import type { Expr } from './ast';
import { defaultFunctions, type Compiled, type FunctionContext, type FunctionRegistry } from './functions';
import { FormulaError, parseFormula } from './parse';

export interface CompileEnv {
  /** Columns of the input table, with their exact names. */
  columns: Column[];
  /** ISO date of the run, for EFFECTIVE_DATE. */
  effectiveDate: string;
}

export type { Compiled } from './functions';

const BLANK: Partial<Record<ColumnType, string>> = { number: '0', text: "''", boolean: 'FALSE' };

/** A blank column cell counts as 0, empty text or FALSE, as in Excel. A computed blank passes on. */
export function withBlankRule(c: Compiled): string {
  const blank = BLANK[c.type];
  return c.bare && blank !== undefined ? `COALESCE(${c.sql}, ${blank})` : c.sql;
}

function fail(message: string, e: Expr): never {
  throw new FormulaError(message, e.start, Math.max(1, e.end - e.start));
}

function expect(c: Compiled, type: ColumnType, e: Expr, what: string, hint: string): string {
  if (c.type !== type) fail(`${what} must be a ${type}, but it is ${c.type === 'number' ? 'a number' : `a ${c.type}`}. ${hint}`, e);
  return withBlankRule(c);
}

const HINT_NUMBER = 'Use VALUE() to turn text into a number.';

/** Text of a value for `&`. A blank stays NULL, and `concat` reads NULL as empty text. */
function toText(c: Compiled): string {
  const sql = c.sql;
  switch (c.type) {
    case 'text':
      return sql;
    case 'number':
      return numberToTextSql(sql);
    case 'date':
      return `strftime(${sql}, '%Y-%m-%d')`;
    case 'boolean':
      return `CASE WHEN ${sql} THEN 'TRUE' WHEN NOT ${sql} THEN 'FALSE' END`;
  }
}

function compileBinary(e: Extract<Expr, { kind: 'binary' }>, l: Compiled, r: Compiled): Compiled {
  const { op } = e;
  if (op === '&') return { sql: `concat(${toText(l)}, ${toText(r)})`, type: 'text' };

  if (op === '=' || op === '<>' || op === '<' || op === '<=' || op === '>' || op === '>=') {
    if (l.type !== r.type) {
      fail(
        `Cannot compare a ${l.type} with a ${r.type}. Use VALUE() to turn text into a number, or TEXT() to turn a number into text.`,
        e,
      );
    }
    let a = withBlankRule(l);
    let b = withBlankRule(r);
    if (l.type === 'text') {
      a = `lower(${a})`;
      b = `lower(${b})`;
    }
    return { sql: `(${a} ${op} ${b})`, type: 'boolean' };
  }

  // Arithmetic. Dates count days: date + number, number + date, date - number, date - date.
  if (l.type === 'date' || r.type === 'date') {
    if (op === '+' && l.type === 'date' && r.type === 'number') {
      return { sql: `(${l.sql} + CAST(${withBlankRule(r)} AS INTEGER))`, type: 'date' };
    }
    if (op === '+' && l.type === 'number' && r.type === 'date') {
      return { sql: `(${r.sql} + CAST(${withBlankRule(l)} AS INTEGER))`, type: 'date' };
    }
    if (op === '-' && l.type === 'date' && r.type === 'number') {
      return { sql: `(${l.sql} - CAST(${withBlankRule(r)} AS INTEGER))`, type: 'date' };
    }
    if (op === '-' && l.type === 'date' && r.type === 'date') {
      return { sql: `CAST((${l.sql} - ${r.sql}) AS DOUBLE)`, type: 'number' };
    }
    fail(`A date can only be added to or subtracted by a number of days, or subtracted from another date, not used with "${op}" like this.`, e);
  }
  const a = expect(l, 'number', e.left, `The left side of "${op}"`, HINT_NUMBER);
  const b = expect(r, 'number', e.right, `The right side of "${op}"`, HINT_NUMBER);
  switch (op) {
    case '/':
      return { sql: `(${a} / NULLIF(${b}, 0))`, type: 'number' };
    case '^': {
      const p = `power(${a}, ${b})`;
      return { sql: `(CASE WHEN isfinite(${p}) THEN ${p} END)`, type: 'number' };
    }
    default:
      return { sql: `(${a} ${op} ${b})`, type: 'number' };
  }
}

function compileCall(
  e: Extract<Expr, { kind: 'call' }>,
  args: Compiled[],
  env: CompileEnv,
  registry: FunctionRegistry,
): Compiled {
  const spec = registry[e.name];
  if (!spec) {
    throw new FormulaError(
      `The function ${e.name} is not supported. Check the spelling, or use a step such as Lookup or Group by for what it does.`,
      e.start,
      e.name.length,
    );
  }
  if (args.length < spec.min || args.length > spec.max) {
    const want =
      spec.min === spec.max
        ? `${spec.min} value${spec.min === 1 ? '' : 's'}`
        : spec.max === Infinity
          ? `at least ${spec.min} value${spec.min === 1 ? '' : 's'}`
          : `${spec.min} to ${spec.max} values`;
    throw new FormulaError(
      `${e.name} needs ${want}, but got ${args.length}. ${args.length < spec.min ? 'Add the missing value' : 'Remove the extra value'}.`,
      e.start,
      e.end - e.start,
    );
  }
  const ctx: FunctionContext = {
    call: e,
    effectiveDate: env.effectiveDate,
    args,
    arg(i, type) {
      const c = args[i]!;
      const where = `Argument ${i + 1} of ${e.name}`;
      if (c.type !== type) {
        fail(`${where} must be ${type === 'number' ? 'a number' : `a ${type}`}, but it is ${c.type === 'number' ? 'a number' : `a ${c.type}`}. ${c.type === 'text' && type === 'number' ? HINT_NUMBER : 'Change the argument, or convert it first.'}`, e.args[i]!);
      }
      return withBlankRule(c);
    },
    error(message, i) {
      return fail(message, i === undefined ? e : e.args[i]!);
    },
  };
  return spec.compile(ctx);
}

function compile(e: Expr, env: CompileEnv, registry: FunctionRegistry): Compiled {
  switch (e.kind) {
    case 'number':
      return { sql: `(${e.value}::DOUBLE)`, type: 'number' };
    case 'string':
      return { sql: quoteString(e.value), type: 'text' };
    case 'boolean':
      return { sql: e.value ? 'TRUE' : 'FALSE', type: 'boolean' };
    case 'column': {
      let column: Column;
      try {
        column = requireColumn(env.columns, e.name);
      } catch (err) {
        if (err instanceof EngineError) throw new FormulaError(err.message, e.start, e.end - e.start);
        throw err;
      }
      return { sql: quoteIdent(column.name), type: column.type, bare: true };
    }
    case 'unary': {
      const operand = compile(e.operand, env, registry);
      const sql = expect(operand, 'number', e.operand, `The value after "${e.op}"`, HINT_NUMBER);
      return { sql: e.op === '-' ? `(-${sql})` : sql, type: 'number' };
    }
    case 'binary':
      return compileBinary(e, compile(e.left, env, registry), compile(e.right, env, registry));
    case 'call':
      return compileCall(
        e,
        e.args.map((a) => compile(a, env, registry)),
        env,
        registry,
      );
  }
}

/** Parses a formula and turns it into a SQL expression over the input columns, or throws `FormulaError`. */
export function compileFormula(source: string, env: CompileEnv, registry: FunctionRegistry = defaultFunctions): Compiled {
  return compile(parseFormula(source), env, registry);
}
