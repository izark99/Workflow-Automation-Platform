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

describe('ROUND, ROUNDUP, ROUNDDOWN', () => {
  it('ROUND rounds half away from zero, on the decimal value that Excel shows', async () => {
    expect(await t.value('ROUND(2.5, 0)')).toBe(3);
    expect(await t.value('ROUND(-2.5, 0)')).toBe(-3);
    expect(await t.value('ROUND(2.675, 2)')).toBe(2.68);
    expect(await t.value('ROUND(1.005, 2)')).toBe(1.01);
    expect(await t.value('ROUND(0.285, 2)')).toBe(0.29);
    expect(await t.value('ROUND(1234, -2)')).toBe(1200);
    expect(await t.value('ROUND(3.14159, 3)')).toBe(3.142);
    expect(await t.value('ROUND([A] / 7, 2)')).toBe(0.43);
  });
  it('ROUNDUP rounds away from zero', async () => {
    expect(await t.value('ROUNDUP(2.1, 0)')).toBe(3);
    expect(await t.value('ROUNDUP(-2.1, 0)')).toBe(-3);
    expect(await t.value('ROUNDUP(1.1, 1)')).toBe(1.1);
    expect(await t.value('ROUNDUP(1234, -2)')).toBe(1300);
    expect(await t.value('ROUNDUP(3.14159, 3)')).toBe(3.142);
    expect(await t.value('ROUNDUP(5, 0)')).toBe(5);
  });
  it('ROUNDDOWN rounds toward zero', async () => {
    expect(await t.value('ROUNDDOWN(2.9, 0)')).toBe(2);
    expect(await t.value('ROUNDDOWN(-2.9, 0)')).toBe(-2);
    expect(await t.value('ROUNDDOWN(1299, -2)')).toBe(1200);
    expect(await t.value('ROUNDDOWN(3.14159, 3)')).toBe(3.141);
  });
  it('need both arguments, numbers only', () => {
    expect(t.fails('ROUND(1)').message).toMatch(/2 values/);
    expect(t.fails('ROUNDUP("a", 1)').message).toMatch(/Argument 1 of ROUNDUP/);
  });
  it('give a blank for a blank result', async () => {
    expect(await t.value('ROUND(1 / 0, 2)')).toBeNull();
  });
});

describe('INT, ABS, MOD', () => {
  it('INT rounds down, also below zero', async () => {
    expect(await t.value('INT(2.9)')).toBe(2);
    expect(await t.value('INT(-1.5)')).toBe(-2);
  });
  it('ABS gives the absolute value', async () => {
    expect(await t.value('ABS(-3)')).toBe(3);
    expect(await t.value('ABS([A])', blankRow)).toBe(0);
  });
  it('MOD takes the sign of the divisor, and a zero divisor gives a blank', async () => {
    expect(await t.value('MOD(10, 3)')).toBe(1);
    expect(await t.value('MOD(-3, 2)')).toBe(1);
    expect(await t.value('MOD(3, -2)')).toBe(-1);
    expect(await t.value('MOD(5.5, 2)')).toBe(1.5);
    expect(await t.value('MOD(1, 0)')).toBeNull();
  });
});

describe('MIN, MAX, SUM', () => {
  it('MIN and MAX ignore blank cells', async () => {
    expect(await t.value('MIN(3, 1, 2)')).toBe(1);
    expect(await t.value('MAX(3, 1, 2)')).toBe(3);
    expect(await t.value('MAX(1, [A])', blankRow)).toBe(1);
    expect(await t.value('MIN([A], [B])', blankRow)).toBeNull();
  });
  it('MIN and MAX also work on dates', async () => {
    expect(await t.value('MAX([D], [D2])')).toBe('2026-09-30');
    expect(await t.value('MIN([D], [D2])')).toBe('2026-09-20');
  });
  it('MIN and MAX need one numeric or date type', () => {
    expect(t.fails('MIN(1, "a")').position).toBe(7);
    expect(t.fails('MAX("a", "b")').message).toMatch(/number or a date/);
    expect(t.fails('MAX()').message).toMatch(/at least 1 value/);
  });
  it('SUM adds numbers and counts a blank as 0', async () => {
    expect(await t.value('SUM(1, 2, 3)')).toBe(6);
    expect(await t.value('SUM([A], [B])', blankRow)).toBe(0);
    expect(await t.value('SUM([A], [B])')).toBe(7);
    expect(t.fails('SUM("a")').message).toMatch(/Argument 1 of SUM/);
  });
});

describe('CEILING and FLOOR', () => {
  it('CEILING rounds up to a multiple, significance 1 by default', async () => {
    expect(await t.value('CEILING(2.5, 1)')).toBe(3);
    expect(await t.value('CEILING(2.5)')).toBe(3);
    expect(await t.value('CEILING(2.5, 2)')).toBe(4);
    expect(await t.value('CEILING(-2.5, 2)')).toBe(-2);
    expect(await t.value('CEILING(-2.5, -2)')).toBe(-4);
    expect(await t.value('CEILING(1.1, 0.1)')).toBeCloseTo(1.1, 12);
    expect(await t.value('CEILING(2.5, 0)')).toBe(0);
  });
  it('CEILING gives a blank for a positive number and a negative significance', async () => {
    expect(await t.value('CEILING(2.5, -1)')).toBeNull();
  });
  it('FLOOR rounds down to a multiple', async () => {
    expect(await t.value('FLOOR(2.5, 1)')).toBe(2);
    expect(await t.value('FLOOR(2.5)')).toBe(2);
    expect(await t.value('FLOOR(2.5, 2)')).toBe(2);
    expect(await t.value('FLOOR(-2.5, 2)')).toBe(-4);
    expect(await t.value('FLOOR(1.1, 0.1)')).toBeCloseTo(1.1, 12);
  });
  it('FLOOR gives a blank for significance 0 and for opposite signs', async () => {
    expect(await t.value('FLOOR(2.5, 0)')).toBeNull();
    expect(await t.value('FLOOR(2.5, -1)')).toBeNull();
  });
});

describe('POWER and SQRT', () => {
  it('compute powers and roots, and give a blank where Excel gives #NUM!', async () => {
    expect(await t.value('POWER(2, 10)')).toBe(1024);
    expect(await t.value('POWER(-8, 0.5)')).toBeNull();
    expect(await t.value('SQRT(16)')).toBe(4);
    expect(await t.value('SQRT(-1)')).toBeNull();
    expect(await t.value('SQRT([A])', blankRow)).toBe(0);
  });
});
