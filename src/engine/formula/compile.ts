import { requireColumn } from '../nodes/columns';
import { quoteIdent, quoteString } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import type { Expr } from './ast';
import type { Compiled, FunctionContext, FunctionRegistry } from './functions';
import { toText, withBlankRule } from './ops';
import { defaultFunctions } from './tier1';
import { FormulaError, parseFormula } from './parse';

export interface CompileEnv {
  /** Columns of the input table, with their exact names. */
  columns: Column[];
  /** ISO date of the run, for EFFECTIVE_DATE. */
  effectiveDate: string;
}

export type { Compiled } from './functions';

function fail(message: string, e: Expr): never {
  throw new FormulaError(message, e.start, Math.max(1, e.end - e.start));
}

function expect(c: Compiled, type: ColumnType, e: Expr, what: string, hint: string): string {
  if (c.type !== type) fail(`${what} must be a ${type}, but it is ${c.type === 'number' ? 'a number' : `a ${c.type}`}. ${hint}`, e);
  return withBlankRule(c);
}

const HINT_NUMBER = 'Use VALUE() to turn text into a number.';

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
  const checked = (i: number, type: ColumnType): Compiled => {
    const c = args[i]!;
    if (c.type !== type) {
      const name = (t: ColumnType) => (t === 'number' ? 'a number' : `a ${t}`);
      const hint =
        c.type === 'text' && type === 'number'
          ? HINT_NUMBER
          : c.type === 'number' && type === 'text'
            ? 'Use TEXT() to turn a number into text, for example TEXT([x], "0").'
            : 'Change the argument, or convert it first.';
      fail(`Argument ${i + 1} of ${e.name} must be ${name(type)}, but it is ${name(c.type)}. ${hint}`, e.args[i]!);
    }
    return c;
  };
  const ctx: FunctionContext = {
    call: e,
    effectiveDate: env.effectiveDate,
    args,
    arg(i, type) {
      return withBlankRule(checked(i, type));
    },
    raw(i, type) {
      return checked(i, type).sql;
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
