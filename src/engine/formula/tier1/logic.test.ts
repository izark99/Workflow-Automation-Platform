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

describe('IF', () => {
  it('picks a branch, and a blank condition counts as false', async () => {
    expect(await t.value('IF(TRUE, 1, 2)')).toBe(1);
    expect(await t.value('IF([A] > 4, "Over", "OK")')).toBe('OK');
    expect(await t.value('IF([F], 1, 2)', blankRow)).toBe(2);
    expect(await t.value('IF(1 > 2, "x", IF(2 > 1, "y", "z"))')).toBe('y');
  });
  it('gives a blank when the condition is false and there is no else value', async () => {
    expect(await t.value('IF(FALSE, 1)')).toBeNull();
    expect(await t.value('IF(TRUE, 1)')).toBe(1);
  });
  it('lets a blank value pass through a branch', async () => {
    expect(await t.value('IF(TRUE, [A], 0)', blankRow)).toBeNull();
  });
  it('needs a true or false condition and branches of one type, and points at the culprit', () => {
    const c = t.fails('IF([A], 1, 2)');
    expect([c.position, c.length]).toEqual([3, 3]);
    expect(c.message).toMatch(/Argument 1 of IF/);
    const b = t.fails('IF(TRUE, 1, "x")');
    expect(b.position).toBe(12);
    expect(b.message).toMatch(/same type as argument 2/);
    expect(t.fails('IF(TRUE)').message).toMatch(/2 to 3 values/);
  });
});

describe('IFS', () => {
  it('returns the value of the first true condition', async () => {
    expect(await t.value('IFS([A] > 5, "a", [A] > 2, "b", TRUE, "c")')).toBe('b');
    expect(await t.value('IFS(FALSE, 1, TRUE, 2)')).toBe(2);
  });
  it('gives a blank when nothing matches', async () => {
    expect(await t.value('IFS(FALSE, 1, FALSE, 2)')).toBeNull();
  });
  it('needs pairs and values of one type', () => {
    expect(t.fails('IFS(TRUE, 1, FALSE)').message).toMatch(/pairs/);
    expect(t.fails('IFS(TRUE, 1, FALSE, "x")').position).toBe(20);
    expect(t.fails('IFS(1, 1)').message).toMatch(/Argument 1 of IFS/);
  });
});

describe('AND, OR, NOT', () => {
  it('combines conditions', async () => {
    expect(await t.value('AND(TRUE, 1 < 2, [A] = 3)')).toBe(true);
    expect(await t.value('AND(TRUE, FALSE)')).toBe(false);
    expect(await t.value('OR(FALSE, FALSE, [A] = 3)')).toBe(true);
    expect(await t.value('OR(FALSE, FALSE)')).toBe(false);
    expect(await t.value('NOT(FALSE)')).toBe(true);
    expect(await t.value('NOT([A] = 3)')).toBe(false);
  });
  it('ignores blanks in AND and OR, and reads a blank as false in NOT', async () => {
    expect(await t.value('AND(TRUE, [F])', blankRow)).toBe(true);
    expect(await t.value('OR(FALSE, [F])', blankRow)).toBe(false);
    expect(await t.value('NOT([F])', blankRow)).toBe(true);
    expect(await t.value('AND(TRUE, [D] > [D2])', blankRow)).toBe(true);
  });
  it('needs true or false values and the right number of arguments', () => {
    expect(t.fails('AND(TRUE, 1)').message).toMatch(/Argument 2 of AND/);
    expect(t.fails('OR()').message).toMatch(/at least 1 value/);
    expect(t.fails('NOT(1, 2)').message).toMatch(/1 value/);
  });
});

describe('IFERROR', () => {
  it('replaces an error, which is a blank result, with the alternative', async () => {
    expect(await t.value('IFERROR(1 / 0, 5)')).toBe(5);
    expect(await t.value('IFERROR(6 / 3, 5)')).toBe(2);
    expect(await t.value('IFERROR((-8) ^ 0.5, 0)')).toBe(0);
    expect(await t.value('IFERROR(IF(FALSE, "x"), "none")')).toBe('none');
  });
  it('also replaces a blank column cell (divergence from Excel, see D17)', async () => {
    expect(await t.value('IFERROR([A], 7)', blankRow)).toBe(7);
  });
  it('needs both values of one type', () => {
    expect(t.fails('IFERROR(1, "x")').position).toBe(11);
  });
});

describe('SWITCH', () => {
  it('compares the first value with each key and returns the matching result', async () => {
    expect(await t.value('SWITCH("b", "a", 1, "b", 2)')).toBe(2);
    expect(await t.value('SWITCH([A], 1, "one", 3, "three")')).toBe('three');
    expect(await t.value('SWITCH("B", "a", 1, "b", 2)')).toBe(2);
  });
  it('uses the default when nothing matches, else gives a blank', async () => {
    expect(await t.value('SWITCH(9, 1, "one", "other")')).toBe('other');
    expect(await t.value('SWITCH(9, 1, "one")')).toBeNull();
  });
  it('needs keys of the type of the first value and results of one type', () => {
    expect(t.fails('SWITCH(1, "a", 1)').position).toBe(10);
    expect(t.fails('SWITCH(1, 1, "a", 2, 3)').position).toBe(21);
    expect(t.fails('SWITCH(1, 1)').message).toMatch(/at least 3 values/);
  });
});

describe('ISBLANK and ISNUMBER', () => {
  it('detect blank cells and numbers', async () => {
    expect(await t.value('ISBLANK([A])', blankRow)).toBe(true);
    expect(await t.value('ISBLANK([T])', blankRow)).toBe(true);
    expect(await t.value('ISBLANK([D])', blankRow)).toBe(true);
    expect(await t.value('ISBLANK([A])')).toBe(false);
    expect(await t.value('ISBLANK("")')).toBe(false);
    expect(await t.value('ISNUMBER([A])')).toBe(true);
    expect(await t.value('ISNUMBER([A])', blankRow)).toBe(false);
    expect(await t.value('ISNUMBER("3")')).toBe(false);
    expect(await t.value('ISNUMBER([T])')).toBe(false);
  });
  it('treat an error as blank (divergence from Excel, see D17)', async () => {
    expect(await t.value('ISBLANK(1 / 0)')).toBe(true);
    expect(await t.value('ISNUMBER(1 / 0)')).toBe(false);
  });
});
