import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../../runner/node-runner';
import type { SqlRunner } from '../../types';
import { blankRow, formulaTester } from '../test-helpers';

let runner: SqlRunner;
let t: ReturnType<typeof formulaTester>;
beforeAll(async () => {
  runner = await createNodeRunner();
  t = formulaTester(runner);
});
afterAll(async () => {
  await runner.close();
});

describe('EFFECTIVE_DATE', () => {
  it('returns the effective date of the run and works in date arithmetic', async () => {
    expect(await t.value('EFFECTIVE_DATE()')).toBe('2026-09-30');
    expect(await t.value('EFFECTIVE_DATE() - 5')).toBe('2026-09-25');
    expect(await t.value('EFFECTIVE_DATE() = [D]')).toBe(true);
    expect(await t.value('MONTH(EFFECTIVE_DATE())')).toBe(9);
  });
  it('takes no argument', () => {
    expect(t.fails('EFFECTIVE_DATE(1)').message).toMatch(/0 values/);
  });
});

describe('DATE', () => {
  it('builds a date and rolls over months and days like Excel', async () => {
    expect(await t.value('DATE(2026, 9, 30)')).toBe('2026-09-30');
    expect(await t.value('DATE(2026, 9, 31)')).toBe('2026-10-01');
    expect(await t.value('DATE(2026, 13, 1)')).toBe('2027-01-01');
    expect(await t.value('DATE(2026, 0, 1)')).toBe('2025-12-01');
    expect(await t.value('DATE(2026, 1, 0)')).toBe('2025-12-31');
    expect(await t.value('DATE(2026, 2, 29)')).toBe('2026-03-01');
    expect(await t.value('DATE(2024, 2, 29)')).toBe('2024-02-29');
    expect(await t.value('DATE(2026, 1, 1) + 30')).toBe('2026-01-31');
  });
  it('builds the date of a day column in the month of the run', async () => {
    expect(await t.value('DATE(YEAR(EFFECTIVE_DATE()), MONTH(EFFECTIVE_DATE()), [A])')).toBe('2026-09-03');
    expect(await t.value('DATE(YEAR(EFFECTIVE_DATE()), MONTH(EFFECTIVE_DATE()), 31)')).toBe('2026-10-01');
  });
  it('gives a blank for a year that cannot be a date, instead of failing the run', async () => {
    expect(await t.value('DATE(99999999, 1, 1)')).toBeNull();
  });
  it('needs numbers', () => {
    expect(t.fails('DATE("2026", 1, 1)').message).toMatch(/Argument 1 of DATE/);
    expect(t.fails('DATE(2026, 1)').message).toMatch(/3 values/);
  });
});

describe('YEAR, MONTH, DAY', () => {
  it('read the parts of a date, and a blank date stays blank', async () => {
    expect(await t.value('YEAR([D])')).toBe(2026);
    expect(await t.value('MONTH([D])')).toBe(9);
    expect(await t.value('DAY([D])')).toBe(30);
    expect(await t.value('YEAR([D])', blankRow)).toBeNull();
    expect(await t.value('DAY([D])', blankRow)).toBeNull();
  });
  it('need a date, and point to DATE() when given text', () => {
    const e = t.fails('YEAR("2026-09-30")');
    expect(e.message).toMatch(/Argument 1 of YEAR must be a date/);
    expect(e.message).toMatch(/DATE\(/);
  });
});

describe('WEEKDAY', () => {
  it('counts Sunday as 1 by default, as Excel does', async () => {
    expect(await t.value('WEEKDAY(DATE(2026, 9, 27))')).toBe(1); // Sunday
    expect(await t.value('WEEKDAY(DATE(2026, 9, 28))')).toBe(2); // Monday
    expect(await t.value('WEEKDAY([D])')).toBe(4); // Wednesday
    expect(await t.value('WEEKDAY(DATE(2026, 9, 26))')).toBe(7); // Saturday
  });
  it('supports return types 2 and 3', async () => {
    expect(await t.value('WEEKDAY(DATE(2026, 9, 28), 2)')).toBe(1);
    expect(await t.value('WEEKDAY(DATE(2026, 9, 27), 2)')).toBe(7);
    expect(await t.value('WEEKDAY(DATE(2026, 9, 28), 3)')).toBe(0);
    expect(await t.value('WEEKDAY(DATE(2026, 9, 27), 3)')).toBe(6);
    expect(await t.value('WEEKDAY([D], 2)')).toBe(3);
  });
  it('gives a blank for a return type it does not support', async () => {
    expect(await t.value('WEEKDAY([D], 9)')).toBeNull();
  });
});

describe('WEEKNUM and ISOWEEKNUM', () => {
  it('WEEKNUM numbers weeks from the week of 1 January', async () => {
    expect(await t.value('WEEKNUM(DATE(2026, 1, 1))')).toBe(1);
    expect(await t.value('WEEKNUM(DATE(2026, 1, 3))')).toBe(1);
    expect(await t.value('WEEKNUM(DATE(2026, 1, 4))')).toBe(2); // Sunday starts week 2
    expect(await t.value('WEEKNUM(DATE(2026, 1, 4), 2)')).toBe(1); // Monday-start: still week 1
    expect(await t.value('WEEKNUM(DATE(2026, 1, 5), 2)')).toBe(2);
    expect(await t.value('WEEKNUM([D])')).toBe(40);
    expect(await t.value('WEEKNUM([D], 2)')).toBe(40);
    expect(await t.value('WEEKNUM(DATE(2026, 12, 31))')).toBe(53);
  });
  it('WEEKNUM type 21 is the ISO week', async () => {
    expect(await t.value('WEEKNUM(DATE(2026, 1, 1), 21)')).toBe(1);
    expect(await t.value('WEEKNUM(DATE(2027, 1, 1), 21)')).toBe(53);
  });
  it('WEEKNUM gives a blank for a return type it does not support', async () => {
    expect(await t.value('WEEKNUM([D], 5)')).toBeNull();
  });
  it('ISOWEEKNUM follows ISO 8601', async () => {
    expect(await t.value('ISOWEEKNUM(DATE(2026, 9, 14))')).toBe(38);
    expect(await t.value('ISOWEEKNUM(DATE(2026, 9, 20))')).toBe(38);
    expect(await t.value('ISOWEEKNUM(DATE(2026, 9, 21))')).toBe(39);
    expect(await t.value('ISOWEEKNUM(DATE(2027, 1, 1))')).toBe(53);
    expect(await t.value('ISOWEEKNUM(DATE(2024, 12, 30))')).toBe(1);
    expect(await t.value('ISOWEEKNUM([D])', blankRow)).toBeNull();
  });
});

describe('EOMONTH and EDATE', () => {
  it('EOMONTH gives the last day of a month, some months away', async () => {
    expect(await t.value('EOMONTH(DATE(2026, 9, 15), 0)')).toBe('2026-09-30');
    expect(await t.value('EOMONTH(DATE(2026, 9, 15), 1)')).toBe('2026-10-31');
    expect(await t.value('EOMONTH(DATE(2026, 9, 15), -1)')).toBe('2026-08-31');
    expect(await t.value('EOMONTH(DATE(2024, 1, 31), 1)')).toBe('2024-02-29');
    expect(await t.value('EOMONTH(DATE(2026, 12, 1), 2)')).toBe('2027-02-28');
    expect(await t.value('EOMONTH([D], 0)', blankRow)).toBeNull();
  });
  it('EDATE moves by months and stops at the end of a shorter month', async () => {
    expect(await t.value('EDATE(DATE(2026, 1, 31), 1)')).toBe('2026-02-28');
    expect(await t.value('EDATE(DATE(2026, 9, 30), -1)')).toBe('2026-08-30');
    expect(await t.value('EDATE(DATE(2026, 9, 30), 12)')).toBe('2027-09-30');
    expect(await t.value('EDATE(DATE(2024, 2, 29), 12)')).toBe('2025-02-28');
  });
});

describe('DAYS', () => {
  it('gives end minus start in days', async () => {
    expect(await t.value('DAYS(DATE(2026, 9, 30), DATE(2026, 9, 20))')).toBe(10);
    expect(await t.value('DAYS(DATE(2026, 9, 20), DATE(2026, 9, 30))')).toBe(-10);
    expect(await t.value('DAYS([D], [D2])')).toBe(10);
  });
});

describe('DATEDIF', () => {
  const start = 'DATE(2020, 1, 15)';
  const end = 'DATE(2026, 9, 30)';
  const totalDays = (Date.UTC(2026, 8, 30) - Date.UTC(2020, 0, 15)) / 86_400_000;
  it('measures in whole years, months and days', async () => {
    expect(await t.value(`DATEDIF(${start}, ${end}, "Y")`)).toBe(6);
    expect(await t.value(`DATEDIF(${start}, ${end}, "M")`)).toBe(80);
    expect(await t.value(`DATEDIF(${start}, ${end}, "D")`)).toBe(totalDays);
    expect(await t.value(`DATEDIF(${start}, ${end}, "y")`)).toBe(6);
  });
  it('measures the remainder after whole years or months', async () => {
    expect(await t.value(`DATEDIF(${start}, ${end}, "YM")`)).toBe(8);
    expect(await t.value(`DATEDIF(${start}, ${end}, "MD")`)).toBe(15);
    expect(await t.value(`DATEDIF(${start}, ${end}, "YD")`)).toBe(258);
  });
  it('counts a month only when the day of the month is reached', async () => {
    expect(await t.value('DATEDIF(DATE(2026, 1, 15), DATE(2026, 2, 14), "M")')).toBe(0);
    expect(await t.value('DATEDIF(DATE(2026, 1, 15), DATE(2026, 2, 15), "M")')).toBe(1);
    expect(await t.value('DATEDIF(DATE(2026, 1, 31), DATE(2026, 2, 28), "M")')).toBe(0);
    expect(await t.value('DATEDIF(DATE(2026, 1, 31), DATE(2026, 3, 1), "MD")')).toBe(1);
    expect(await t.value('DATEDIF(DATE(2026, 9, 30), DATE(2026, 9, 30), "D")')).toBe(0);
  });
  it('gives a blank when the start is after the end', async () => {
    expect(await t.value(`DATEDIF(${end}, ${start}, "D")`)).toBeNull();
  });
  it('needs the unit in quotes and says which units exist', () => {
    const dynamic = t.fails('DATEDIF([D2], [D], [T])');
    expect(dynamic.message).toMatch(/in quotes/);
    const bad = t.fails('DATEDIF([D2], [D], "X")');
    expect(bad.message).toMatch(/Y, M, D, MD, YM, YD/);
    expect(bad.position).toBe(19);
  });
});
