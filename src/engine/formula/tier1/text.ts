import { quoteString } from '../../sql';
import type { Compiled, FunctionContext, FunctionRegistry } from '../functions';
import { toText } from '../ops';
import { roundSql } from './math';

const text = (sql: string): Compiled => ({ sql, type: 'text' });
const num = (sql: string): Compiled => ({ sql, type: 'number' });
const whole = (sql: string) => `CAST(trunc(${sql}) AS INTEGER)`;
const ONE = '(1::DOUBLE)';

const NUMBER_TEXT = String.raw`[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?`;

/** Turns an Excel SEARCH pattern (? and * wildcards, ~ as escape) into a RE2 pattern, in SQL. */
function wildcardRegex(find: string): string {
  const escaped = String.raw`regexp_replace(${find}, '([.+^$(){}|\[\]\\])', '\\\1', 'g')`;
  const marked = `replace(replace(replace(${escaped}, '~~', chr(3)), '~?', chr(1)), '~*', chr(2))`;
  const wild = `replace(replace(${marked}, '?', '.'), '*', '.*')`;
  return String.raw`replace(replace(replace(${wild}, chr(1), '\?'), chr(2), '\*'), chr(3), '~')`;
}

/** Excel date format to strftime. Needs at least one of yyyy, yy, mmmm, mmm, mm, m, dddd, ddd, dd, d. */
function dateFormat(fmt: string): string | undefined {
  const codes: Record<string, string> = {
    yyyy: '%Y', yy: '%y', mmmm: '%B', mmm: '%b', mm: '%m', m: '%-m', dddd: '%A', ddd: '%a', dd: '%d', d: '%-d',
  };
  let found = false;
  const out = fmt.replace(/(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d)|(%)/gi, (_m, token: string | undefined) => {
    if (token === undefined) return '%%';
    found = true;
    return codes[token.toLowerCase()]!;
  });
  return found ? out : undefined;
}

const SUPPORTED_NUMBER_FORMATS =
  'Use a format such as "0", "0.00", "#,##0", "#,##0.00", "0%", "0.0%" or "000", or a date format such as "yyyy-mm-dd".';

function numberFormat(ctx: FunctionContext, fmt: string, x: string): string {
  const m = /^([#0,]*)(?:\.(0*))?(%?)$/.exec(fmt);
  if (!m || !/[0#]/.test(m[1] ?? '')) {
    ctx.error(`The number format "${fmt}" is not supported. ${SUPPORTED_NUMBER_FORMATS}`, 1);
  }
  const [, intPart = '', decPart = '', percent = ''] = m!;
  const decimals = decPart.length;
  const thousands = intPart.includes(',');
  const minInt = [...intPart].filter((c) => c === '0').length;
  const r = roundSql(percent ? `(${x} * 100)` : x, String(decimals));
  const shown = `format('{:${thousands ? ',' : ''}.${decimals}f}', abs(${r}))`;
  const padded = minInt > 1 && !thousands ? `lpad(${shown}, ${minInt + (decimals > 0 ? decimals + 1 : 0)}, '0')` : shown;
  return `(CASE WHEN ${r} < 0 THEN '-' ELSE '' END || ${padded}${percent ? " || '%'" : ''})`;
}

export const textFunctions: FunctionRegistry = {
  LEFT: {
    min: 1,
    max: 2,
    compile(ctx) {
      const t = ctx.arg(0, 'text');
      const n = ctx.args[1] ? ctx.arg(1, 'number') : ONE;
      return text(`(CASE WHEN ${n} < 0 THEN NULL ELSE left(${t}, ${whole(n)}) END)`);
    },
  },
  RIGHT: {
    min: 1,
    max: 2,
    compile(ctx) {
      const t = ctx.arg(0, 'text');
      const n = ctx.args[1] ? ctx.arg(1, 'number') : ONE;
      return text(`(CASE WHEN ${n} < 0 THEN NULL ELSE right(${t}, ${whole(n)}) END)`);
    },
  },
  MID: {
    min: 3,
    max: 3,
    compile(ctx) {
      const t = ctx.arg(0, 'text');
      const s = ctx.arg(1, 'number');
      const n = ctx.arg(2, 'number');
      return text(`(CASE WHEN ${s} < 1 OR ${n} < 0 THEN NULL ELSE substr(${t}, ${whole(s)}, ${whole(n)}) END)`);
    },
  },
  LEN: { min: 1, max: 1, compile: (ctx) => num(`CAST(length(${ctx.arg(0, 'text')}) AS DOUBLE)`) },
  // Excel TRIM also collapses runs of inner spaces to one space.
  TRIM: { min: 1, max: 1, compile: (ctx) => text(`regexp_replace(trim(${ctx.arg(0, 'text')}), ' +', ' ', 'g')`) },
  UPPER: { min: 1, max: 1, compile: (ctx) => text(`upper(${ctx.arg(0, 'text')})`) },
  LOWER: { min: 1, max: 1, compile: (ctx) => text(`lower(${ctx.arg(0, 'text')})`) },
  PROPER: {
    min: 1,
    max: 1,
    compile(ctx) {
      // A letter is upper case at the start or after a non-letter (so "o'neil" gives "O'Neil"), else lower case.
      const t = ctx.arg(0, 'text');
      const i = '"__i"';
      return text(
        `COALESCE((SELECT string_agg(CASE WHEN ${i} = 1 OR NOT regexp_matches(substr(${t}, ${i} - 1, 1), '\\p{L}') ` +
          `THEN upper(substr(${t}, ${i}, 1)) ELSE lower(substr(${t}, ${i}, 1)) END, '' ORDER BY ${i}) ` +
          `FROM range(1, length(${t}) + 1) AS "__r"(${i})), '')`,
      );
    },
  },
  CONCAT: {
    min: 1,
    max: Infinity,
    compile: (ctx) => text(`concat(${ctx.args.map(toText).join(', ')})`),
  },
  TEXTJOIN: {
    min: 3,
    max: Infinity,
    compile(ctx) {
      const delimiter = ctx.arg(0, 'text');
      const ignoreEmpty = ctx.arg(1, 'boolean');
      const parts = ctx.args.slice(2).map(toText);
      const kept = `array_to_string(list_filter([${parts.join(', ')}], "__x" -> "__x" IS NOT NULL AND "__x" <> ''), ${delimiter})`;
      const all = `array_to_string([${parts.map((p) => `COALESCE(${p}, '')`).join(', ')}], ${delimiter})`;
      return text(`(CASE WHEN ${ignoreEmpty} THEN ${kept} ELSE ${all} END)`);
    },
  },
  SUBSTITUTE: {
    min: 3,
    max: 4,
    compile(ctx) {
      const t = ctx.arg(0, 'text');
      const o = ctx.arg(1, 'text');
      const n = ctx.arg(2, 'text');
      if (!ctx.args[3]) return text(`replace(${t}, ${o}, ${n})`);
      const k = whole(ctx.arg(3, 'number'));
      const parts = `string_split(${t}, ${o})`;
      return text(
        `(CASE WHEN ${o} = '' THEN ${t} WHEN ${k} < 1 THEN NULL WHEN len(${parts}) <= ${k} THEN ${t} ` +
          `ELSE array_to_string(list_slice(${parts}, 1, ${k}), ${o}) || ${n} || ` +
          `array_to_string(list_slice(${parts}, ${k} + 1, len(${parts})), ${o}) END)`,
      );
    },
  },
  REPLACE: {
    min: 4,
    max: 4,
    compile(ctx) {
      const t = ctx.arg(0, 'text');
      const s = ctx.arg(1, 'number');
      const c = ctx.arg(2, 'number');
      const n = ctx.arg(3, 'text');
      return text(
        `(CASE WHEN ${s} < 1 OR ${c} < 0 THEN NULL ELSE substr(${t}, 1, ${whole(s)} - 1) || ${n} || substr(${t}, ${whole(s)} + ${whole(c)}) END)`,
      );
    },
  },
  FIND: {
    min: 2,
    max: 3,
    compile(ctx) {
      const f = ctx.arg(0, 'text');
      const w = ctx.arg(1, 'text');
      const s = whole(ctx.args[2] ? ctx.arg(2, 'number') : ONE);
      const at = `instr(substr(${w}, ${s}), ${f})`;
      return num(
        `(CASE WHEN ${s} < 1 OR ${s} > length(${w}) THEN NULL WHEN ${at} = 0 THEN NULL ELSE CAST(${at} + ${s} - 1 AS DOUBLE) END)`,
      );
    },
  },
  SEARCH: {
    min: 2,
    max: 3,
    compile(ctx) {
      const pattern = wildcardRegex(ctx.arg(0, 'text'));
      const w = ctx.arg(1, 'text');
      const s = whole(ctx.args[2] ? ctx.arg(2, 'number') : ONE);
      const rest = `substr(${w}, ${s})`;
      const flags = quoteString('(?is)');
      return num(
        `(CASE WHEN ${s} < 1 OR ${s} > length(${w}) THEN NULL WHEN NOT regexp_matches(${rest}, ${flags} || ${pattern}) THEN NULL ` +
          `ELSE CAST(length(regexp_extract(${rest}, ${quoteString('(?is)^(.*?)(?:')} || ${pattern} || ')', 1)) + ${s} AS DOUBLE) END)`,
      );
    },
  },
  VALUE: {
    min: 1,
    max: 1,
    compile(ctx) {
      // A number stays as it is. Text becomes a number when it looks like one, else a blank (never an error).
      if (ctx.args[0]!.type === 'number') return num(ctx.args[0]!.sql);
      const s = `regexp_replace(trim(${ctx.arg(0, 'text')}), ',', '', 'g')`;
      const full = quoteString(NUMBER_TEXT);
      const percent = quoteString(`${NUMBER_TEXT}%`);
      return num(
        `(CASE WHEN regexp_full_match(${s}, ${percent}) THEN CAST(substr(${s}, 1, length(${s}) - 1) AS DOUBLE) / 100 ` +
          `WHEN regexp_full_match(${s}, ${full}) THEN CAST(${s} AS DOUBLE) END)`,
      );
    },
  },
  TEXT: {
    min: 2,
    max: 2,
    compile(ctx) {
      const format = ctx.call.args[1]!;
      if (format.kind !== 'string') {
        ctx.error('The format of TEXT must be written in quotes, for example TEXT([Hours], "0.00").', 1);
      }
      const fmt = (format as Extract<typeof format, { kind: 'string' }>).value;
      const v = ctx.args[0]!;
      switch (v.type) {
        case 'text':
          return v;
        case 'boolean':
          return text(toText(v));
        case 'date': {
          const code = dateFormat(fmt);
          if (code === undefined) {
            ctx.error(`The date format "${fmt}" has no date part. Use yyyy, mm, dd, mmm, mmmm, ddd or dddd, for example "yyyy-mm-dd".`, 1);
          }
          return text(`strftime(${v.sql}, ${quoteString(code!)})`);
        }
        case 'number':
          return text(numberFormat(ctx, fmt, ctx.arg(0, 'number')));
      }
    },
  },
};
