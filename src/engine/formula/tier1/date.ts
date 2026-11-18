import { quoteString } from '../../sql';
import type { Compiled, FunctionContext, FunctionRegistry } from '../functions';

const date = (sql: string): Compiled => ({ sql, type: 'date' });
const num = (sql: string): Compiled => ({ sql, type: 'number' });
const whole = (sql: string) => `CAST(trunc(${sql}) AS INTEGER)`;
const ONE = '(1::DOUBLE)';

const UNITS = ['Y', 'M', 'D', 'MD', 'YM', 'YD'];

/** Reads a text argument that must be written in quotes in the formula, because it is used when the flow is compiled. */
function literalText(ctx: FunctionContext, i: number, what: string): string {
  const e = ctx.call.args[i]!;
  if (e.kind !== 'string') {
    ctx.error(`The ${what} of ${ctx.call.name} must be written in quotes, for example "${UNITS[0]}".`, i);
  }
  return (e as Extract<typeof e, { kind: 'string' }>).value;
}

export const dateFunctions: FunctionRegistry = {
  EFFECTIVE_DATE: {
    min: 0,
    max: 0,
    compile(ctx) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.effectiveDate)) {
        ctx.error(`The effective date "${ctx.effectiveDate}" of this run is not a date such as 2026-09-30. Pick the date again.`);
      }
      return date(`CAST(${quoteString(ctx.effectiveDate)} AS DATE)`);
    },
  },
  DATE: {
    min: 3,
    max: 3,
    compile(ctx) {
      const y = whole(ctx.arg(0, 'number'));
      const m = whole(ctx.arg(1, 'number'));
      const d = whole(ctx.arg(2, 'number'));
      // Months and days that are too large or too small roll over, as in Excel. TRY gives a blank for a year out of range.
      return date(`TRY(CAST(make_date(${y}, 1, 1) + to_months(${m} - 1) + to_days(${d} - 1) AS DATE))`);
    },
  },
  YEAR: { min: 1, max: 1, compile: (ctx) => num(`CAST(year(${ctx.arg(0, 'date')}) AS DOUBLE)`) },
  MONTH: { min: 1, max: 1, compile: (ctx) => num(`CAST(month(${ctx.arg(0, 'date')}) AS DOUBLE)`) },
  DAY: { min: 1, max: 1, compile: (ctx) => num(`CAST(day(${ctx.arg(0, 'date')}) AS DOUBLE)`) },
  WEEKDAY: {
    min: 1,
    max: 2,
    compile(ctx) {
      const d = ctx.arg(0, 'date');
      const t = whole(ctx.args[1] ? ctx.arg(1, 'number') : ONE);
      // Type 1: Sunday is 1. Type 2: Monday is 1. Type 3: Monday is 0.
      return num(
        `CAST(CASE ${t} WHEN 1 THEN isodow(${d}) % 7 + 1 WHEN 2 THEN isodow(${d}) WHEN 3 THEN isodow(${d}) - 1 END AS DOUBLE)`,
      );
    },
  },
  WEEKNUM: {
    min: 1,
    max: 2,
    compile(ctx) {
      const d = ctx.arg(0, 'date');
      const t = whole(ctx.args[1] ? ctx.arg(1, 'number') : ONE);
      const jan1 = `make_date(CAST(year(${d}) AS INTEGER), 1, 1)`;
      // Week 1 is the week that holds 1 January. Type 1 starts weeks on Sunday, type 2 on Monday, type 21 is ISO.
      return num(
        `CAST(CASE ${t} WHEN 1 THEN (dayofyear(${d}) - 1 + isodow(${jan1}) % 7) // 7 + 1 ` +
          `WHEN 2 THEN (dayofyear(${d}) - 1 + isodow(${jan1}) - 1) // 7 + 1 WHEN 21 THEN weekofyear(${d}) END AS DOUBLE)`,
      );
    },
  },
  ISOWEEKNUM: { min: 1, max: 1, compile: (ctx) => num(`CAST(weekofyear(${ctx.arg(0, 'date')}) AS DOUBLE)`) },
  EOMONTH: {
    min: 2,
    max: 2,
    compile(ctx) {
      const d = ctx.arg(0, 'date');
      const m = whole(ctx.arg(1, 'number'));
      return date(`last_day(CAST(date_trunc('month', ${d}) + to_months(${m}) AS DATE))`);
    },
  },
  EDATE: {
    min: 2,
    max: 2,
    compile(ctx) {
      return date(`CAST(${ctx.arg(0, 'date')} + to_months(${whole(ctx.arg(1, 'number'))}) AS DATE)`);
    },
  },
  DAYS: {
    min: 2,
    max: 2,
    compile: (ctx) => num(`CAST(${ctx.arg(0, 'date')} - ${ctx.arg(1, 'date')} AS DOUBLE)`),
  },
  DATEDIF: {
    min: 3,
    max: 3,
    compile(ctx) {
      const s = ctx.arg(0, 'date');
      const e = ctx.arg(1, 'date');
      const unit = literalText(ctx, 2, 'unit').toUpperCase();
      if (!UNITS.includes(unit)) {
        ctx.error(`The unit "${unit}" of DATEDIF is not known. Use one of: ${UNITS.join(', ')}.`, 2);
      }
      // Whole months: the month is complete only when the day of the month is reached.
      const months = `((year(${e}) - year(${s})) * 12 + month(${e}) - month(${s}) - CASE WHEN day(${e}) < day(${s}) THEN 1 ELSE 0 END)`;
      const body: Record<string, string> = {
        D: `${e} - ${s}`,
        M: months,
        Y: `${months} // 12`,
        YM: `${months} % 12`,
        // Days left after the whole months, or after the whole years (a day that does not exist stops at month end).
        MD: `${e} - CAST(${s} + to_months(CAST(${months} AS INTEGER)) AS DATE)`,
        YD: `${e} - CAST(${s} + to_years(CAST(${months} // 12 AS INTEGER)) AS DATE)`,
      };
      return num(`CAST(CASE WHEN ${s} > ${e} THEN NULL ELSE ${body[unit]} END AS DOUBLE)`);
    },
  },
};
