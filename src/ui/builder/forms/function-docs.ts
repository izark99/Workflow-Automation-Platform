// The Tier 1 functions as the function list shows them. A unit test keeps this list equal to the functions the engine registers.
export type FunctionGroup = 'Logic' | 'Math' | 'Text' | 'Date';

export interface FunctionDoc {
  name: string;
  group: FunctionGroup;
  signature: string;
  text: string;
}

const d = (group: FunctionGroup, signature: string, text: string): FunctionDoc => ({ name: signature.slice(0, signature.indexOf('(')), group, signature, text });

export const FUNCTION_DOCS: FunctionDoc[] = [
  d('Logic', 'IF(condition, value_if_true, value_if_false)', 'One value when the condition is true, another when it is false.'),
  d('Logic', 'IFS(condition1, value1, condition2, value2, ...)', 'The value of the first condition that is true. End with TRUE and a value as the default.'),
  d('Logic', 'AND(a, b, ...)', 'True when every argument is true.'),
  d('Logic', 'OR(a, b, ...)', 'True when at least one argument is true.'),
  d('Logic', 'NOT(value)', 'Turns true into false and false into true.'),
  d('Logic', 'IFERROR(value, value_if_error)', 'The value, or the second argument when the value is an error.'),
  d('Logic', 'SWITCH(value, match1, result1, ..., default)', 'The result of the first match. The last argument is the default.'),
  d('Logic', 'ISBLANK(value)', 'True when the cell is empty.'),
  d('Logic', 'ISNUMBER(value)', 'True when the value is a number.'),
  d('Math', 'ROUND(number, digits)', 'Rounds to the number of digits, half away from zero.'),
  d('Math', 'ROUNDUP(number, digits)', 'Rounds away from zero.'),
  d('Math', 'ROUNDDOWN(number, digits)', 'Rounds towards zero.'),
  d('Math', 'INT(number)', 'Rounds down to the nearest whole number.'),
  d('Math', 'ABS(number)', 'The number without its sign.'),
  d('Math', 'MOD(number, divisor)', 'The remainder after dividing. It has the sign of the divisor.'),
  d('Math', 'MIN(a, b, ...)', 'The smallest value. Empty cells are ignored.'),
  d('Math', 'MAX(a, b, ...)', 'The largest value. Empty cells are ignored.'),
  d('Math', 'CEILING(number, significance)', 'Rounds up to a multiple of the significance.'),
  d('Math', 'FLOOR(number, significance)', 'Rounds down to a multiple of the significance.'),
  d('Math', 'POWER(number, power)', 'The number raised to the power.'),
  d('Math', 'SQRT(number)', 'The square root.'),
  d('Math', 'SUM(a, b, ...)', 'The sum of the values. Empty cells count as 0.'),
  d('Text', 'LEFT(text, count)', 'The first characters of the text.'),
  d('Text', 'RIGHT(text, count)', 'The last characters of the text.'),
  d('Text', 'MID(text, start, count)', 'Characters from the middle of the text. The first character is 1.'),
  d('Text', 'LEN(text)', 'The number of characters.'),
  d('Text', 'TRIM(text)', 'Removes spaces at the ends and extra spaces between words.'),
  d('Text', 'UPPER(text)', 'Capital letters.'),
  d('Text', 'LOWER(text)', 'Small letters.'),
  d('Text', 'PROPER(text)', 'A capital letter at the start of each word.'),
  d('Text', 'CONCAT(a, b, ...)', 'Joins the values into one text.'),
  d('Text', 'TEXTJOIN(separator, ignore_empty, a, b, ...)', 'Joins the values with a separator. Set ignore_empty to TRUE to skip empty values.'),
  d('Text', 'SUBSTITUTE(text, old, new, instance)', 'Replaces the old text with the new one. The instance is optional.'),
  d('Text', 'REPLACE(text, start, count, new)', 'Replaces a number of characters from a position.'),
  d('Text', 'FIND(find, within, start)', 'The position of the text, upper and lower case matter. The start is optional.'),
  d('Text', 'SEARCH(find, within, start)', 'The position of the text, case does not matter, ? and * work as wildcards.'),
  d('Text', 'TEXT(value, format)', 'A number or date written as text, for example TEXT([Date], "yyyy-mm-dd").'),
  d('Text', 'VALUE(text)', 'Turns text that looks like a number into a number.'),
  d('Date', 'DATE(year, month, day)', 'A date from its parts.'),
  d('Date', 'YEAR(date)', 'The year of a date.'),
  d('Date', 'MONTH(date)', 'The month of a date, 1 to 12.'),
  d('Date', 'DAY(date)', 'The day of the month.'),
  d('Date', 'WEEKDAY(date, type)', 'The day of the week as a number. The type is optional; 2 gives Monday = 1.'),
  d('Date', 'WEEKNUM(date, type)', 'The week number of the year. The type is optional.'),
  d('Date', 'ISOWEEKNUM(date)', 'The ISO week number, weeks start on Monday.'),
  d('Date', 'EOMONTH(date, months)', 'The last day of the month, some months before or after the date.'),
  d('Date', 'EDATE(date, months)', 'The same day, some months before or after the date.'),
  d('Date', 'DATEDIF(start, end, unit)', 'The time between two dates in "D" days, "M" months or "Y" years.'),
  d('Date', 'DAYS(end, start)', 'The number of days between two dates.'),
  d('Date', 'EFFECTIVE_DATE()', 'The effective date of the run. Use it instead of TODAY, so a run for a past period gives the same result every time.'),
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
