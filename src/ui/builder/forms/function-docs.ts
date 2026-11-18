import { translate } from '../../i18n';
import type { MessageKey } from '../../i18n';

// The Tier 1 functions as the function list shows them. A unit test keeps this list equal to the functions the engine registers.
export type FunctionGroup = 'Logic' | 'Math' | 'Text' | 'Date';

export interface FunctionDoc {
  name: string;
  group: FunctionGroup;
  signature: string;
  text: string;
}

const d = (group: FunctionGroup, signature: string): FunctionDoc => {
  const name = signature.slice(0, signature.indexOf('('));
  return {
    name,
    group,
    signature,
    // The description comes from the catalog (builder.fn.NAME), read when it is used.
    get text(): string {
      return translate(`builder.fn.${name}` as MessageKey);
    },
  };
};

export const FUNCTION_DOCS: FunctionDoc[] = [
  d('Logic', 'IF(condition, value_if_true, value_if_false)'),
  d('Logic', 'IFS(condition1, value1, condition2, value2, ...)'),
  d('Logic', 'AND(a, b, ...)'),
  d('Logic', 'OR(a, b, ...)'),
  d('Logic', 'NOT(value)'),
  d('Logic', 'IFERROR(value, value_if_error)'),
  d('Logic', 'SWITCH(value, match1, result1, ..., default)'),
  d('Logic', 'ISBLANK(value)'),
  d('Logic', 'ISNUMBER(value)'),
  d('Math', 'ROUND(number, digits)'),
  d('Math', 'ROUNDUP(number, digits)'),
  d('Math', 'ROUNDDOWN(number, digits)'),
  d('Math', 'INT(number)'),
  d('Math', 'ABS(number)'),
  d('Math', 'MOD(number, divisor)'),
  d('Math', 'MIN(a, b, ...)'),
  d('Math', 'MAX(a, b, ...)'),
  d('Math', 'CEILING(number, significance)'),
  d('Math', 'FLOOR(number, significance)'),
  d('Math', 'POWER(number, power)'),
  d('Math', 'SQRT(number)'),
  d('Math', 'SUM(a, b, ...)'),
  d('Text', 'LEFT(text, count)'),
  d('Text', 'RIGHT(text, count)'),
  d('Text', 'MID(text, start, count)'),
  d('Text', 'LEN(text)'),
  d('Text', 'TRIM(text)'),
  d('Text', 'UPPER(text)'),
  d('Text', 'LOWER(text)'),
  d('Text', 'PROPER(text)'),
  d('Text', 'CONCAT(a, b, ...)'),
  d('Text', 'TEXTJOIN(separator, ignore_empty, a, b, ...)'),
  d('Text', 'SUBSTITUTE(text, old, new, instance)'),
  d('Text', 'REPLACE(text, start, count, new)'),
  d('Text', 'FIND(find, within, start)'),
  d('Text', 'SEARCH(find, within, start)'),
  d('Text', 'TEXT(value, format)'),
  d('Text', 'VALUE(text)'),
  d('Date', 'DATE(year, month, day)'),
  d('Date', 'YEAR(date)'),
  d('Date', 'MONTH(date)'),
  d('Date', 'DAY(date)'),
  d('Date', 'WEEKDAY(date, type)'),
  d('Date', 'WEEKNUM(date, type)'),
  d('Date', 'ISOWEEKNUM(date)'),
  d('Date', 'EOMONTH(date, months)'),
  d('Date', 'EDATE(date, months)'),
  d('Date', 'DATEDIF(start, end, unit)'),
  d('Date', 'DAYS(end, start)'),
  d('Date', 'EFFECTIVE_DATE()'),
];

/** The functions that get a button next to the editor. All others are in the list. */
export const COMMON_FUNCTIONS = ['IF', 'IFS', 'AND', 'OR', 'ROUND', 'TEXT', 'DATE', 'EFFECTIVE_DATE'];

export const GROUP_ORDER: FunctionGroup[] = ['Logic', 'Math', 'Text', 'Date'];

/** Functions whose name, signature or text contains the search text, ignoring case. */
export function searchFunctions(query: string): FunctionDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return FUNCTION_DOCS;
  return FUNCTION_DOCS.filter((f) => f.name.toLowerCase().includes(q) || f.signature.toLowerCase().includes(q) || f.text.toLowerCase().includes(q));
}
