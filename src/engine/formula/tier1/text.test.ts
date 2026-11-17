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

describe('LEFT, RIGHT, MID, LEN', () => {
  it('cut text', async () => {
    expect(await t.value('LEFT("abcdef", 2)')).toBe('ab');
    expect(await t.value('LEFT("abcdef")')).toBe('a');
    expect(await t.value('LEFT("abc", 10)')).toBe('abc');
    expect(await t.value('LEFT("abc", 0)')).toBe('');
    expect(await t.value('RIGHT("abcdef", 2)')).toBe('ef');
    expect(await t.value('RIGHT("abcdef")')).toBe('f');
    expect(await t.value('MID("abcdef", 2, 3)')).toBe('bcd');
    expect(await t.value('MID("abc", 5, 2)')).toBe('');
    expect(await t.value('MID("abcdef", 4, 99)')).toBe('def');
    expect(await t.value('LEFT("Đà Nẵng", 2)')).toBe('Đà');
  });
  it('give a blank for a negative length or a start below 1, where Excel gives #VALUE!', async () => {
    expect(await t.value('LEFT("abc", -1)')).toBeNull();
    expect(await t.value('RIGHT("abc", -1)')).toBeNull();
    expect(await t.value('MID("abc", 0, 1)')).toBeNull();
    expect(await t.value('MID("abc", 1, -1)')).toBeNull();
  });
  it('LEN counts characters, and a blank cell has length 0', async () => {
    expect(await t.value('LEN("abc")')).toBe(3);
    expect(await t.value('LEN("Đà Nẵng")')).toBe(7);
    expect(await t.value('LEN([T])', blankRow)).toBe(0);
  });
  it('need text, so a number must be converted first', () => {
    const e = t.fails('LEFT(123, 2)');
    expect(e.message).toMatch(/Argument 1 of LEFT must be a text/);
    expect(e.message).toMatch(/TEXT/);
    expect(t.fails('LEN()').message).toMatch(/1 value/);
  });
});

describe('TRIM, UPPER, LOWER, PROPER', () => {
  it('TRIM removes outer spaces and collapses inner runs to one space', async () => {
    expect(await t.value('TRIM("  a   b  c ")')).toBe('a b c');
    expect(await t.value('TRIM([T])', blankRow)).toBe('');
  });
  it('change case', async () => {
    expect(await t.value('UPPER("aBc")')).toBe('ABC');
    expect(await t.value('LOWER("aBc")')).toBe('abc');
    expect(await t.value('PROPER("hello wORLD")')).toBe('Hello World');
    expect(await t.value('PROPER("o\'neil 2nd-floor")')).toBe("O'Neil 2Nd-Floor");
    expect(await t.value('PROPER("nguyễn văn an")')).toBe('Nguyễn Văn An');
    expect(await t.value('PROPER("")')).toBe('');
  });
});

describe('CONCAT and TEXTJOIN', () => {
  it('CONCAT joins values of any type like &', async () => {
    expect(await t.value('CONCAT("a", "b", "c")')).toBe('abc');
    expect(await t.value('CONCAT("n=", 5, " d=", [D])')).toBe('n=5 d=2026-09-30');
    expect(await t.value('CONCAT([T], "x")', blankRow)).toBe('x');
    expect(t.fails('CONCAT()').message).toMatch(/at least 1 value/);
  });
  it('TEXTJOIN joins with a delimiter and can skip empty values', async () => {
    expect(await t.value('TEXTJOIN(", ", TRUE, "a", "", "b")')).toBe('a, b');
    expect(await t.value('TEXTJOIN(", ", FALSE, "a", "", "b")')).toBe('a, , b');
    expect(await t.value('TEXTJOIN("-", TRUE, [T], "x")', blankRow)).toBe('x');
    expect(await t.value('TEXTJOIN("-", FALSE, [T], "x")', blankRow)).toBe('-x');
    expect(await t.value('TEXTJOIN("-", TRUE, 1, 2.5)')).toBe('1-2.5');
  });
  it('TEXTJOIN needs a text delimiter and a true or false flag', () => {
    expect(t.fails('TEXTJOIN(1, TRUE, "a")').message).toMatch(/Argument 1 of TEXTJOIN/);
    expect(t.fails('TEXTJOIN(",", 1, "a")').message).toMatch(/Argument 2 of TEXTJOIN/);
    expect(t.fails('TEXTJOIN(",", TRUE)').message).toMatch(/at least 3 values/);
  });
});

describe('SUBSTITUTE and REPLACE', () => {
  it('SUBSTITUTE replaces every match, case-sensitively, or only the nth', async () => {
    expect(await t.value('SUBSTITUTE("a-b-c", "-", "+")')).toBe('a+b+c');
    expect(await t.value('SUBSTITUTE("Aa", "a", "x")')).toBe('Ax');
    expect(await t.value('SUBSTITUTE("a-b-c-d", "-", "+", 2)')).toBe('a-b+c-d');
    expect(await t.value('SUBSTITUTE("a-b", "-", "+", 5)')).toBe('a-b');
    expect(await t.value('SUBSTITUTE("abc", "", "x")')).toBe('abc');
    expect(await t.value('SUBSTITUTE("a-b", "-", "")')).toBe('ab');
    expect(await t.value('SUBSTITUTE("a-b", "-", "+", 0)')).toBeNull();
  });
  it('REPLACE swaps a part by position', async () => {
    expect(await t.value('REPLACE("abcdef", 2, 3, "X")')).toBe('aXef');
    expect(await t.value('REPLACE("abc", 1, 0, "X")')).toBe('Xabc');
    expect(await t.value('REPLACE("abc", 5, 1, "X")')).toBe('abcX');
    expect(await t.value('REPLACE("abc", 0, 1, "X")')).toBeNull();
    expect(await t.value('REPLACE("abc", 1, -1, "X")')).toBeNull();
  });
});

describe('FIND and SEARCH', () => {
  it('FIND is case-sensitive and starts at a position', async () => {
    expect(await t.value('FIND("b", "abcb")')).toBe(2);
    expect(await t.value('FIND("b", "abcb", 3)')).toBe(4);
    expect(await t.value('FIND("B", "abc")')).toBeNull();
    expect(await t.value('FIND("", "abc")')).toBe(1);
    expect(await t.value('FIND("a", "abc", 0)')).toBeNull();
    expect(await t.value('FIND("a", "abc", 9)')).toBeNull();
  });
  it('SEARCH ignores case and accepts ? and * wildcards, with ~ as escape', async () => {
    expect(await t.value('SEARCH("B", "abc")')).toBe(2);
    expect(await t.value('SEARCH("b?", "abc")')).toBe(2);
    expect(await t.value('SEARCH("a*c", "xxabbc")')).toBe(3);
    expect(await t.value('SEARCH("~?", "a?b")')).toBe(2);
    expect(await t.value('SEARCH("~*", "a*b")')).toBe(2);
    expect(await t.value('SEARCH("~~", "a~b")')).toBe(2);
    expect(await t.value('SEARCH("a.c", "abc a.c")')).toBe(5);
    expect(await t.value('SEARCH("(", "a(b")')).toBe(2);
    expect(await t.value('SEARCH("b", "abcb", 3)')).toBe(4);
    expect(await t.value('SEARCH("z", "abc")')).toBeNull();
    expect(await t.value('SEARCH("", "abc")')).toBe(1);
  });
});

describe('VALUE', () => {
  it('reads numbers from text, and keeps a number as it is', async () => {
    expect(await t.value('VALUE("12")')).toBe(12);
    expect(await t.value('VALUE(" 2.5 ")')).toBe(2.5);
    expect(await t.value('VALUE("-1")')).toBe(-1);
    expect(await t.value('VALUE("1,234.5")')).toBe(1234.5);
    expect(await t.value('VALUE("1e3")')).toBe(1000);
    expect(await t.value('VALUE("12%")')).toBeCloseTo(0.12, 12);
    expect(await t.value('VALUE(7)')).toBe(7);
  });
  it('gives a blank for text that is not a number, as the R8 check needs', async () => {
    expect(await t.value('VALUE("2h")')).toBeNull();
    expect(await t.value('VALUE("")')).toBeNull();
    expect(await t.value('VALUE("abc")')).toBeNull();
    expect(await t.value('VALUE("nan")')).toBeNull();
    expect(await t.value('VALUE([T])', blankRow)).toBeNull();
    expect(await t.value('ISNUMBER(VALUE("2h"))')).toBe(false);
    expect(await t.value('ISNUMBER(VALUE("2"))')).toBe(true);
  });
  it('refuses a date or a boolean', () => {
    expect(t.fails('VALUE([D])').message).toMatch(/Argument 1 of VALUE/);
  });
});

describe('TEXT', () => {
  it('formats numbers', async () => {
    expect(await t.value('TEXT(3.14159, "0.00")')).toBe('3.14');
    expect(await t.value('TEXT(2.5, "0")')).toBe('3');
    expect(await t.value('TEXT(-2.5, "0")')).toBe('-3');
    expect(await t.value('TEXT(1234567.891, "#,##0.00")')).toBe('1,234,567.89');
    expect(await t.value('TEXT(1234567, "#,##0")')).toBe('1,234,567');
    expect(await t.value('TEXT(7, "000")')).toBe('007');
    expect(await t.value('TEXT(-7, "000")')).toBe('-007');
    expect(await t.value('TEXT(0.256, "0%")')).toBe('26%');
    expect(await t.value('TEXT(0.256, "0.0%")')).toBe('25.6%');
    expect(await t.value('TEXT(1.005, "0.00")')).toBe('1.01');
    expect(await t.value('TEXT([A], "0.0")', blankRow)).toBe('0.0');
  });
  it('formats dates', async () => {
    expect(await t.value('TEXT([D], "yyyy-mm-dd")')).toBe('2026-09-30');
    expect(await t.value('TEXT([D], "dd/mm/yyyy")')).toBe('30/09/2026');
    expect(await t.value('TEXT([D], "d/m/yy")')).toBe('30/9/26');
    expect(await t.value('TEXT([D], "mmm yyyy")')).toBe('Sep 2026');
    expect(await t.value('TEXT([D], "dddd, mmmm d")')).toBe('Wednesday, September 30');
    expect(await t.value('TEXT([D], "ddd")')).toBe('Wed');
    expect(await t.value('TEXT([D], "yyyy-mm")')).toBe('2026-09');
    expect(await t.value('TEXT([D], "yyyy%")')).toBe('2026%');
  });
  it('gives a blank for a blank date, and leaves text as it is', async () => {
    expect(await t.value('TEXT([D], "yyyy")', blankRow)).toBeNull();
    expect(await t.value('TEXT("abc", "0.00")')).toBe('abc');
  });
  it('needs a format written in quotes, and says which formats work', () => {
    const dynamic = t.fails('TEXT(1, [T])');
    expect(dynamic.position).toBe(8);
    expect(dynamic.message).toMatch(/in quotes/);
    const bad = t.fails('TEXT(1, "0.0.0")');
    expect(bad.message).toMatch(/not supported/);
    expect(bad.message).toMatch(/0\.00/);
    expect(t.fails('TEXT([D], "0.00")').message).toMatch(/date/i);
  });
});
