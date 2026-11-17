import type { Compiled, FunctionContext, FunctionRegistry } from '../functions';

const num = (sql: string): Compiled => ({ sql, type: 'number' });

/** The decimal value that Excel shows: the number read at 15 significant digits. NULL if it does not fit. */
const dec = (x: string) => `TRY_CAST(TRY_CAST(${x} AS VARCHAR) AS DECIMAL(38,15))`;
const digits = (d: string) => `CAST(trunc(${d}) AS INTEGER)`;

/** A power that Excel would call #NUM!, such as the root of a negative number, becomes a blank. */
const finite = (sql: string) => `(CASE WHEN isfinite(${sql}) THEN ${sql} END)`;

function multiple(ctx: FunctionContext): { x: string; s: string } {
  return { x: ctx.arg(0, 'number'), s: ctx.args[1] ? ctx.arg(1, 'number') : '(1::DOUBLE)' };
}

export const mathFunctions: FunctionRegistry = {
  ROUND: {
    min: 2,
    max: 2,
    compile(ctx) {
      const x = ctx.arg(0, 'number');
      const d = digits(ctx.arg(1, 'number'));
      // Decimal rounding gives Excel's 2.68 for 2.675 and 1.01 for 1.005; huge or tiny values fall back to DOUBLE.
      return num(`COALESCE(CAST(round(${dec(x)}, ${d}) AS DOUBLE), round(${x}, ${d}))`);
    },
  },
  ROUNDDOWN: {
    min: 2,
    max: 2,
    compile(ctx) {
      const v = dec(ctx.arg(0, 'number'));
      return num(`CAST(trunc(${v}, ${digits(ctx.arg(1, 'number'))}) AS DOUBLE)`);
    },
  },
  ROUNDUP: {
    min: 2,
    max: 2,
    compile(ctx) {
      const v = dec(ctx.arg(0, 'number'));
      const d = digits(ctx.arg(1, 'number'));
      const step = `CAST(power(10::DOUBLE, -${d}) AS DECIMAL(38,15))`;
      return num(`CAST(trunc(${v}, ${d}) + CASE WHEN trunc(${v}, ${d}) <> ${v} THEN sign(${v}) * ${step} ELSE 0 END AS DOUBLE)`);
    },
  },
  INT: { min: 1, max: 1, compile: (ctx) => num(`floor(${ctx.arg(0, 'number')})`) },
  ABS: { min: 1, max: 1, compile: (ctx) => num(`abs(${ctx.arg(0, 'number')})`) },
  MOD: {
    min: 2,
    max: 2,
    compile(ctx) {
      const n = ctx.arg(0, 'number');
      const d = ctx.arg(1, 'number');
      // The result takes the sign of the divisor, as in Excel. A zero divisor gives a blank.
      return num(`(${n} - ${d} * floor(${n} / NULLIF(${d}, 0)))`);
    },
  },
  MIN: {
    min: 1,
    max: Infinity,
    compile: (ctx) => minMax(ctx, 'least', 'MIN'),
  },
  MAX: {
    min: 1,
    max: Infinity,
    compile: (ctx) => minMax(ctx, 'greatest', 'MAX'),
  },
  SUM: {
    min: 1,
    max: Infinity,
    compile: (ctx) => num(`(${ctx.args.map((_, i) => ctx.arg(i, 'number')).join(' + ')})`),
  },
  CEILING: {
    min: 1,
    max: 2,
    compile(ctx) {
      const { x, s } = multiple(ctx);
      return num(
        `(CASE WHEN ${s} = 0 THEN 0 WHEN ${x} > 0 AND ${s} < 0 THEN NULL ELSE ceil(round(${x} / ${s}, 9)) * ${s} END)`,
      );
    },
  },
  FLOOR: {
    min: 1,
    max: 2,
    compile(ctx) {
      const { x, s } = multiple(ctx);
      return num(
        `(CASE WHEN ${s} = 0 THEN NULL WHEN ${x} > 0 AND ${s} < 0 THEN NULL ELSE floor(round(${x} / ${s}, 9)) * ${s} END)`,
      );
    },
  },
  POWER: {
    min: 2,
    max: 2,
    compile: (ctx) => num(finite(`power(${ctx.arg(0, 'number')}, ${ctx.arg(1, 'number')})`)),
  },
  SQRT: {
    min: 1,
    max: 1,
    compile(ctx) {
      const x = ctx.arg(0, 'number');
      return num(`(CASE WHEN ${x} >= 0 THEN sqrt(${x}) END)`);
    },
  },
};

/** MIN and MAX ignore blank cells (DuckDB `least` and `greatest` skip NULL) and also work on dates. */
function minMax(ctx: FunctionContext, fn: 'least' | 'greatest', name: string): Compiled {
  const type = ctx.args[0]!.type;
  if (type !== 'number' && type !== 'date') {
    ctx.error(`Argument 1 of ${name} must be a number or a date, but it is ${type === 'text' ? 'text' : `a ${type}`}. Use VALUE() to turn text into a number.`, 0);
  }
  const parts = ctx.args.map((_, i) => ctx.raw(i, type));
  return { sql: `${fn}(${parts.join(', ')})`, type };
}
