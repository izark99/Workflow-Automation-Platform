import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultFunctions } from './index';

// Tier 1 of docs/SPEC.md section 6. Tier 2 functions must stay out.
const TIER1 = [
  'IF', 'IFS', 'AND', 'OR', 'NOT', 'IFERROR', 'SWITCH', 'ISBLANK', 'ISNUMBER',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'ABS', 'MOD', 'MIN', 'MAX', 'CEILING', 'FLOOR', 'POWER', 'SQRT', 'SUM',
  'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'UPPER', 'LOWER', 'PROPER', 'CONCAT', 'TEXTJOIN', 'SUBSTITUTE', 'REPLACE',
  'FIND', 'SEARCH', 'TEXT', 'VALUE',
  'DATE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'WEEKNUM', 'ISOWEEKNUM', 'EOMONTH', 'EDATE', 'DATEDIF', 'DAYS',
  'EFFECTIVE_DATE',
];

describe('Tier 1 coverage', () => {
  it('registers exactly the Tier 1 functions of the spec', () => {
    expect(Object.keys(defaultFunctions).sort()).toEqual([...TIER1].sort());
  });

  it('has a unit test that calls every Tier 1 function', () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const source = readdirSync(dir)
      .filter((f) => f.endsWith('.test.ts') && f !== 'coverage.test.ts')
      .map((f) => readFileSync(path.join(dir, f), 'utf8'))
      .join('\n');
    const untested = TIER1.filter((name) => !new RegExp(`['"\`\\s(]${name}\\(`).test(source));
    expect(untested).toEqual([]);
  });
});
