import { expect, test } from '@playwright/test';
import { csvOf, expectWorkbook, lcg, pick, runGenerated } from './new-steps-kit';
import type { FixtureCell } from '../scripts/lib/refimport-fixtures';

// G1 of Phase 8: one generated flow for each new step. Each task of a step adds its test here.

const NAMES = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Dũng', 'Đặng Thu Em', 'Võ Thị Hà', 'Bùi Quang Huy', 'Đỗ Lan Anh'];
const DEPTS = ['Sản xuất', 'Kho', 'QA', 'Kế toán'];

/** 300 rows with empty values, repeated values (ties) and Vietnamese text. */
function people(seed: number): { columns: string[]; rows: FixtureCell[][] } {
  const rand = lcg(seed);
  const rows: FixtureCell[][] = [];
  for (let i = 0; i < 300; i++) {
    rows.push([
      `E${String(i + 1).padStart(3, '0')}`,
      rand() < 0.05 ? null : pick(rand, NAMES),
      rand() < 0.05 ? null : pick(rand, DEPTS),
      rand() < 0.1 ? null : Math.floor(rand() * 8) + (rand() < 0.5 ? 0 : 0.5),
      rand() < 0.1 ? null : `2026-09-${String(Math.floor(rand() * 28) + 1).padStart(2, '0')}`,
    ]);
  }
  return { columns: ['Id', 'Name', 'Dept', 'Hours', 'Day'], rows };
}

/** The order that the Sort step promises, written as a plain loop: empty values last, equal keys keep their place. */
function sorted(rows: FixtureCell[][], keys: { col: number; desc?: boolean }[]): FixtureCell[][] {
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    for (const k of keys) {
      const x = a.r[k.col]!;
      const y = b.r[k.col]!;
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      if (x === y) continue;
      const lower = x < y;
      return (lower ? -1 : 1) * (k.desc ? -1 : 1);
    }
    return a.i - b.i;
  });
  return indexed.map((x) => x.r);
}

test.describe('Sort', () => {
  const data = people(7);
  const file = { File: { name: 'people.csv', text: csvOf(data.columns, data.rows) } };

  test('by a text column and a number column, with empty values, ties and Vietnamese text', async ({ page }) => {
    const reply = await runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'sort', type: 'sort', settings: { keys: [{ column: 'Dept' }, { column: 'Hours', direction: 'desc' }] } }],
      edges: [{ source: 'in_File', target: 'sort' }],
      outputs: [{ sheet: 'Sorted', from: 'sort' }],
    });
    expectWorkbook(reply, [{ name: 'Sorted', columns: data.columns, rows: sorted(data.rows, [{ col: 2 }, { col: 3, desc: true }]) }]);
  });

  test('by a date, and by a formula', async ({ page }) => {
    const byDate = await runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'sort', type: 'sort', settings: { keys: [{ column: 'Day', direction: 'desc' }, { column: 'Id' }] } }],
      edges: [{ source: 'in_File', target: 'sort' }],
      outputs: [{ sheet: 'Sorted', from: 'sort' }],
    });
    expectWorkbook(byDate, [{ name: 'Sorted', columns: data.columns, rows: sorted(data.rows, [{ col: 4, desc: true }, { col: 0 }]) }]);
    // The formula key: 2 x Hours (a blank number counts as 0 in a formula), ties by the order of the file.
    const byFormula = await runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'sort', type: 'sort', settings: { keys: [{ expression: '[Hours] * 2', direction: 'desc' }] } }],
      edges: [{ source: 'in_File', target: 'sort' }],
      outputs: [{ sheet: 'Sorted', from: 'sort' }],
    });
    const keyed = data.rows.map((r) => [...r, ((r[3] as number | null) ?? 0) * 2]);
    const expected = sorted(keyed, [{ col: 5, desc: true }]).map((r) => r.slice(0, 5));
    expectWorkbook(byFormula, [{ name: 'Sorted', columns: data.columns, rows: expected }]);
  });

  test('the test can fail: a different order is found', async ({ page }) => {
    const reply = await runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'sort', type: 'sort', settings: { keys: [{ column: 'Hours' }] } }],
      edges: [{ source: 'in_File', target: 'sort' }],
      outputs: [{ sheet: 'Sorted', from: 'sort' }],
    });
    expect(() => expectWorkbook(reply, [{ name: 'Sorted', columns: data.columns, rows: sorted(data.rows, [{ col: 3, desc: true }]) }])).toThrow();
  });
});

/** Remove duplicates as a plain loop: rows with the same key are the same row; an empty value equals an empty value. */
function dedupeRows(rows: FixtureCell[][], cols: number[], keep: 'first' | 'last'): { kept: FixtureCell[][]; removed: FixtureCell[][] } {
  const keyOf = (r: FixtureCell[]): string => JSON.stringify(cols.map((c) => (r[c] === null || r[c] === '' ? null : r[c])));
  const winner = new Map<string, number>();
  rows.forEach((r, i) => {
    const k = keyOf(r);
    if (keep === 'first') {
      if (!winner.has(k)) winner.set(k, i);
    } else winner.set(k, i);
  });
  const kept: FixtureCell[][] = [];
  const removed: FixtureCell[][] = [];
  rows.forEach((r, i) => (winner.get(keyOf(r)) === i ? kept : removed).push(r));
  return { kept, removed };
}

test.describe('Remove duplicates', () => {
  const data = people(11);
  const file = { File: { name: 'people.csv', text: csvOf(data.columns, data.rows) } };
  const run = (page: Parameters<typeof runGenerated>[0], settings: Record<string, unknown>) =>
    runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'dd', type: 'dedupe', settings }],
      edges: [{ source: 'in_File', target: 'dd' }],
      outputs: [{ sheet: 'Kept', from: 'dd', handle: 'kept' }, { sheet: 'Removed', from: 'dd', handle: 'removed' }],
    });

  for (const keep of ['first', 'last'] as const) {
    test(`on Dept and Hours, keep the ${keep}: kept and removed equal the loop, with empty values and Vietnamese text`, async ({ page }) => {
      const reply = await run(page, { columns: ['Dept', 'Hours'], keep });
      const { kept, removed } = dedupeRows(data.rows, [2, 3], keep);
      expect(kept.length + removed.length).toBe(data.rows.length);
      expect(removed.length).toBeGreaterThan(100);
      expectWorkbook(reply, [
        { name: 'Kept', columns: data.columns, rows: kept },
        { name: 'Removed', columns: data.columns, rows: removed },
      ]);
    });
  }

  test('on all columns nothing is removed when every row has its own Id, and the Removed sheet is empty', async ({ page }) => {
    const reply = await run(page, {});
    expectWorkbook(reply, [
      { name: 'Kept', columns: data.columns, rows: data.rows },
      { name: 'Removed', columns: data.columns, rows: [] },
    ]);
  });

  test('on Name, with empty names equal to each other', async ({ page }) => {
    const reply = await run(page, { columns: ['Name'] });
    const { kept, removed } = dedupeRows(data.rows, [1], 'first');
    expect(kept.length).toBe(NAMES.length + 1);
    expectWorkbook(reply, [
      { name: 'Kept', columns: data.columns, rows: kept },
      { name: 'Removed', columns: data.columns, rows: removed },
    ]);
  });
});

/** Top N as a plain loop: rank inside each group by the key (empty last), ties by input order, keep the first n. */
function topN(rows: FixtureCell[][], n: number, by: { col: number; desc: boolean } | null, groupCol: number | null): FixtureCell[][] {
  const groups = new Map<string, { first: number; rows: { r: FixtureCell[]; i: number }[] }>();
  rows.forEach((r, i) => {
    const k = groupCol === null ? '' : JSON.stringify(r[groupCol] === '' ? null : r[groupCol]);
    const g = groups.get(k) ?? { first: i, rows: [] };
    g.rows.push({ r, i });
    groups.set(k, g);
  });
  const out: FixtureCell[][] = [];
  for (const g of [...groups.values()].sort((a, b) => a.first - b.first)) {
    const ranked = [...g.rows];
    if (by) {
      ranked.sort((a, b) => {
        const x = a.r[by.col]!;
        const y = b.r[by.col]!;
        if (x === null && y === null) return a.i - b.i;
        if (x === null) return 1;
        if (y === null) return -1;
        if (x === y) return a.i - b.i;
        return ((x < y ? -1 : 1) * (by.desc ? -1 : 1)) as number;
      });
    }
    out.push(...ranked.slice(0, n).map((x) => x.r));
  }
  return out;
}

test.describe('Top N', () => {
  const data = people(23);
  const file = { File: { name: 'people.csv', text: csvOf(data.columns, data.rows) } };
  const run = (page: Parameters<typeof runGenerated>[0], settings: Record<string, unknown>, extra: { parameters?: unknown[]; parameterValues?: Record<string, unknown> } = {}) =>
    runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'top', type: 'top_n', settings }],
      edges: [{ source: 'in_File', target: 'top' }],
      outputs: [{ sheet: 'Top', from: 'top' }],
      ...extra,
    });

  test('the 25 largest by Hours, ties cut by the order of the file, with empty values', async ({ page }) => {
    const reply = await run(page, { n: 25, order: 'largest', by: { column: 'Hours' } });
    expectWorkbook(reply, [{ name: 'Top', columns: data.columns, rows: topN(data.rows, 25, { col: 3, desc: true }, null) }]);
  });

  test('the 10 smallest by a date, and the first 7 rows', async ({ page }) => {
    const smallest = await run(page, { n: 10, order: 'smallest', by: { column: 'Day' } });
    expectWorkbook(smallest, [{ name: 'Top', columns: data.columns, rows: topN(data.rows, 10, { col: 4, desc: false }, null) }]);
    const first = await run(page, { n: 7, order: 'first' });
    expectWorkbook(first, [{ name: 'Top', columns: data.columns, rows: topN(data.rows, 7, null, null) }]);
  });

  test('the 3 largest per department, groups in the order they first appear', async ({ page }) => {
    const reply = await run(page, { n: 3, order: 'largest', by: { column: 'Hours' }, groupBy: ['Dept'] });
    const expected = topN(data.rows, 3, { col: 3, desc: true }, 2);
    expect(expected.length).toBe(3 * (DEPTS.length + 1));
    expectWorkbook(reply, [{ name: 'Top', columns: data.columns, rows: expected }]);
  });

  test('N from a parameter: the same flow with 4 and with 9', async ({ page }) => {
    const parameters = [{ key: 'n', label: 'How many', type: 'number', required: true }];
    for (const n of [4, 9]) {
      const reply = await run(page, { n: { $param: 'n' }, order: 'largest', by: { column: 'Hours' } }, { parameters, parameterValues: { n } });
      expectWorkbook(reply, [{ name: 'Top', columns: data.columns, rows: topN(data.rows, n, { col: 3, desc: true }, null) }]);
    }
  });
});

/** The text cut into parts as a plain loop: `sep` null cuts at the last space; the rest rules of the step. */
function cutText(value: FixtureCell, sep: string | null, count: number, rest: 'last' | 'drop'): (string | null)[] {
  const out: (string | null)[] = Array(count).fill(null);
  if (value === null) return out;
  const text = String(value).trim();
  let parts: string[];
  if (sep === null) {
    const at = text.lastIndexOf(' ');
    parts = at < 0 ? [text] : [text.slice(0, at), text.slice(at + 1)];
  } else parts = text.split(sep);
  for (let i = 0; i < count; i++) {
    let p: string | undefined = parts[i];
    if (i === count - 1 && rest === 'last' && parts.length > count) p = parts.slice(i).join(sep ?? ' ');
    const v = (p ?? '').trim();
    out[i] = v === '' ? null : v;
  }
  return out;
}

test.describe('Split column', () => {
  const rand = lcg(31);
  const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Đặng', 'Võ'];
  const MIDDLE = ['Văn', 'Thị', 'Hoàng Minh', 'Thu', ''];
  const GIVEN = ['An', 'Bình', 'Cường', 'Dũng', 'Hà', 'Nhung', 'Đức'];
  const rows: FixtureCell[][] = [];
  for (let i = 0; i < 200; i++) {
    const r = rand();
    const name = r < 0.05 ? null : r < 0.08 ? null : `${pick(rand, FAMILY)} ${[pick(rand, MIDDLE)].filter(Boolean).join(' ')} ${pick(rand, GIVEN)}`.replace(/  +/g, ' ');
    rows.push([`E${i + 1}`, name, i % 7 === 0 ? ' a, b,,c ,d,e ' : i % 5 === 0 ? null : 'x,y', 'tail']);
  }
  const columns = ['Id', 'Name', 'Codes', 'Tail'];
  const file = { File: { name: 'names.csv', text: csvOf(columns, rows) } };
  const run = (page: Parameters<typeof runGenerated>[0], settings: Record<string, unknown>) =>
    runGenerated(page, { inputs: ['File'], files: file, nodes: [{ id: 'sp', type: 'split_column', settings }], edges: [{ source: 'in_File', target: 'sp' }], outputs: [{ sheet: 'Split', from: 'sp' }] });

  test('a Vietnamese full name at the last space: family and middle names, and the given name', async ({ page }) => {
    const reply = await run(page, { column: 'Name', cut: 'last_space', names: ['Family and middle', 'Given'] });
    const expected: FixtureCell[][] = rows.map((r) => [r[0]!, ...cutText(r[1]!, null, 2, 'last'), r[2]!, r[3]!]);
    expectWorkbook(reply, [{ name: 'Split', columns: ['Id', 'Family and middle', 'Given', 'Codes', 'Tail'], rows: expected }]);
  });

  test('codes at every comma into 3 columns with the rest in the last, and with the rest dropped, keeping the original', async ({ page }) => {
    const kept = await run(page, { column: 'Codes', cut: 'comma', names: ['C1', 'C2', 'C3'], keepOriginal: true });
    expectWorkbook(kept, [{ name: 'Split', columns: ['Id', 'Name', 'Codes', 'C1', 'C2', 'C3', 'Tail'], rows: rows.map((r): FixtureCell[] => [r[0]!, r[1]!, r[2]!, ...cutText(r[2]!, ',', 3, 'last'), r[3]!]) }]);
    const dropped = await run(page, { column: 'Codes', cut: 'comma', names: ['C1', 'C2', 'C3'], rest: 'drop' });
    expectWorkbook(dropped, [{ name: 'Split', columns: ['Id', 'Name', 'C1', 'C2', 'C3', 'Tail'], rows: rows.map((r): FixtureCell[] => [r[0]!, r[1]!, ...cutText(r[2]!, ',', 3, 'drop'), r[3]!]) }]);
  });
});

const BECOMES_SPACE = new RegExp('[\\t\\n\\v\\f\\r\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]', 'g');
// trim() of the engine removes the spaces of Unicode (the space separators), not tabs, line breaks or zero-width characters.
const TRIM_ENDS = new RegExp('^[ \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]+|[ \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]+$', 'g');
// The test names control characters on purpose: they are the input of the step.
// eslint-disable-next-line no-control-regex
const REMOVED = new RegExp('[\\u0001-\\u0008\\u000e-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200d\\u2060\\ufeff]', 'g');

/** The cleaning of a text as a plain loop of JavaScript, in the order of the step. */
function cleanText(value: FixtureCell, o: { nonPrinting?: boolean; collapse?: boolean; trim?: boolean; marks?: boolean; mode?: 'upper' | 'lower' | 'proper' }): FixtureCell {
  if (value === null) return null;
  let t = String(value);
  if (o.nonPrinting) t = t.replace(BECOMES_SPACE, ' ').replace(REMOVED, '');
  if (o.collapse) t = t.replace(/ {2,}/g, ' ');
  if (o.trim) t = t.replace(TRIM_ENDS, '');
  if (o.marks) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  if (o.mode === 'upper') t = t.toUpperCase();
  else if (o.mode === 'lower') t = t.toLowerCase();
  else if (o.mode === 'proper') t = t.toLowerCase().split(' ').map((w) => (w === '' ? w : w[0]!.toUpperCase() + w.slice(1))).join(' ');
  return t === '' ? null : t;
}

test.describe('Clean text', () => {
  const rand = lcg(41);
  const WORDS = ['nguyễn', 'VĂN', 'Đặng', 'thị', 'HỒNG', 'Lê', 'bình', 'ĐỨC', 'Hà', 'phạm'];
  const JUNK = [' ', '  ', '   ', '\t', '\u00a0', '\u200b'];
  const rows: FixtureCell[][] = [];
  for (let i = 0; i < 200; i++) {
    const n = rand() < 0.07 ? 0 : 1 + Math.floor(rand() * 4);
    let text = pick(rand, JUNK) === ' ' ? '' : pick(rand, [' ', '', '  ']);
    for (let k = 0; k < n; k++) text += pick(rand, WORDS) + pick(rand, JUNK);
    // Composed and decomposed forms are mixed in one column.
    if (rand() < 0.3) text = text.normalize('NFD');
    rows.push([`E${i + 1}`, rand() < 0.06 || text === '' ? null : text, 'keep me']);
  }
  const columns = ['Id', 'Name', 'Note'];
  const file = { File: { name: 'names.csv', text: csvOf(columns, rows) } };
  const run = (page: Parameters<typeof runGenerated>[0], settings: Record<string, unknown>) =>
    runGenerated(page, { inputs: ['File'], files: file, nodes: [{ id: 'cl', type: 'clean_text', settings: { columns: ['Name'], ...settings } }], edges: [{ source: 'in_File', target: 'cl' }], outputs: [{ sheet: 'Clean', from: 'cl' }] });

  test('spaces, characters that print nothing, marks and Proper Case on a mixed Vietnamese column', async ({ page }) => {
    const reply = await run(page, { trim: true, collapse: true, nonPrinting: true, removeMarks: true, caseMode: 'proper' });
    const expected: FixtureCell[][] = rows.map((r) => [r[0]!, cleanText(r[1]!, { nonPrinting: true, collapse: true, trim: true, marks: true, mode: 'proper' }), r[2]!]);
    expectWorkbook(reply, [{ name: 'Clean', columns, rows: expected }]);
  });

  test('only the case, UPPER, with the marks kept; and a new column with a suffix', async ({ page }) => {
    const upper = await run(page, { trim: false, collapse: false, caseMode: 'upper' });
    expectWorkbook(upper, [{ name: 'Clean', columns, rows: rows.map((r) => [r[0]!, cleanText(r[1]!, { mode: 'upper' }), r[2]!]) }]);
    const suffix = await run(page, { target: 'suffix', suffix: ' (clean)', removeMarks: true, caseMode: 'lower' });
    expectWorkbook(suffix, [{ name: 'Clean', columns: ['Id', 'Name', 'Name (clean)', 'Note'], rows: rows.map((r) => [r[0]!, r[1]!, cleanText(r[1]!, { collapse: true, trim: true, marks: true, mode: 'lower' }), r[2]!]) }]);
  });
});

test.describe('Check', () => {
  const data = people(53);
  const file = { File: { name: 'people.csv', text: csvOf(data.columns, data.rows) } };
  const rules = [
    { name: 'Hours range', condition: 'AND([Hours] >= 0, [Hours] <= 6)', message: 'Hours must be from 0 to 6.' },
    { name: 'Department', condition: 'NOT(ISBLANK([Dept]))', message: 'A department is required.' },
    { name: 'Day set', condition: '[Day] >= DATE(2026, 9, 10)', message: 'The day is empty or too early.' },
  ];
  // The same rules as a plain loop. A blank number counts as 0 in a comparison; a blank date makes the condition null, which fails.
  const verdicts = (r: FixtureCell[]): boolean[] => [
    ((r[3] as number | null) ?? 0) >= 0 && ((r[3] as number | null) ?? 0) <= 6,
    r[2] !== null && r[2] !== '',
    r[4] !== null && String(r[4]) >= '2026-09-10',
  ];
  const run = (page: Parameters<typeof runGenerated>[0], stop: boolean) =>
    runGenerated(page, {
      inputs: ['File'],
      files: file,
      nodes: [{ id: 'chk', type: 'check', settings: { rules, stop } }],
      edges: [{ source: 'in_File', target: 'chk' }],
      outputs: [{ sheet: 'Passed', from: 'chk', handle: 'ok' }, { sheet: 'Errors', from: 'chk', handle: 'errors' }],
    });

  test('ok and errors equal the loop: a row that fails two rules appears twice, in the order of the rows and then the rules', async ({ page }) => {
    const ok = data.rows.filter((r) => verdicts(r).every(Boolean));
    const errors: FixtureCell[][] = [];
    for (const r of data.rows) verdicts(r).forEach((good, i) => { if (!good) errors.push([...r, rules[i]!.name, rules[i]!.message]); });
    expect(errors.length).toBeGreaterThan(ok.length / 4);
    expect(new Set(errors.map((e) => e[0])).size).toBeLessThan(errors.length);
    expectWorkbook(await run(page, false), [
      { name: 'Passed', columns: data.columns, rows: ok },
      { name: 'Errors', columns: [...data.columns, 'Rule', 'Message'], rows: errors },
    ]);
  });

  test('with "stop the run" on, a run that has failures stops with the count of each rule', async ({ page }) => {
    const reply = await run(page, true);
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.code).toBe('check_failed');
    const counts = rules.map((_, i) => data.rows.filter((r) => !verdicts(r)[i]).length);
    for (const [i, rule] of rules.entries()) expect(reply.message).toContain(`"${rule.name}" (${counts[i]})`);
  });
});
