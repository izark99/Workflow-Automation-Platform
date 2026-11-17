import { numberToTextSql } from '../sql';
import type { ColumnType } from '../types';
import type { Compiled } from './functions';

const BLANK: Partial<Record<ColumnType, string>> = { number: '0', text: "''", boolean: 'FALSE' };

/** A blank column cell counts as 0, empty text or FALSE, as in Excel. A computed blank passes on. */
export function withBlankRule(c: Compiled): string {
  const blank = BLANK[c.type];
  return c.bare && blank !== undefined ? `COALESCE(${c.sql}, ${blank})` : c.sql;
}

/** SQL for "equal" between two values of the same type. Text ignores case, as in Excel. */
export function equalsSql(l: Compiled, r: Compiled): string {
  const a = withBlankRule(l);
  const b = withBlankRule(r);
  return l.type === 'text' ? `(lower(${a}) = lower(${b}))` : `(${a} = ${b})`;
}

/** Text of a value for `&`. A blank stays NULL, and `concat` reads NULL as empty text. */
export function toText(c: Compiled): string {
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
