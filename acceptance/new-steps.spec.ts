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
