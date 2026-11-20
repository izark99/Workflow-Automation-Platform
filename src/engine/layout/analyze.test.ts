import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ambiguousLayouts, clearLayouts, type Layout } from '../../../scripts/lib/layout-fixtures.ts';
import { xlsxBytes } from '../../../scripts/lib/refimport-fixtures.ts';
import { loadInputFile, parseInputSettings } from '../input/load';
import { readGrid } from '../refimport';
import type { Grid, RawCell } from '../refimport/types';
import { createNodeRunner } from '../runner/node-runner';
import type { SqlRunner } from '../types';
import { analyzeLayout, chooseSheet, proposalToSettings } from './analyze';

// T6.17: the analysis of a sample file. Every clear layout gives its truth with high confidence; every ambiguous layout gives
// low confidence and lists the alternatives; the proposal, applied, reads the same table as the truth.
let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const blob = (l: Layout): Blob & { name: string } => Object.assign(new Blob([l.file.bytes as BlobPart]), { name: l.file.name });
const gridOf = (l: Layout): Promise<Grid> => readGrid(blob(l), l.truth?.sheet === undefined ? {} : { sheet: l.truth.sheet });

describe('every clear layout is analysed as its truth says', () => {
  for (const layout of clearLayouts()) {
    it(layout.name, async () => {
      const t = layout.truth!;
      const a = analyzeLayout(await gridOf(layout));
      expect(a.found).toBe(true);
      // The region, with high confidence and a reason for each.
      expect(a.headerRow).toMatchObject({ value: t.headerRow, confidence: 'high' });
      expect(a.firstColumn).toMatchObject({ value: t.firstColumn, confidence: 'high' });
      expect(a.lastColumn).toMatchObject({ value: t.lastColumn, confidence: 'high' });
      expect(a.stopAt!.confidence).toBe('high');
      for (const p of [a.headerRow, a.firstColumn, a.lastColumn, a.stopAt, a.expect]) {
        expect(p!.reason.id).toMatch(/^engine\.layout/);
      }
      expect(a.columns).toEqual(t.columns);
      expect(a.expect!.value).toEqual(t.columns.filter((c) => !/^Column \d+$/.test(c)));
      expect(a.otherTables).toEqual([]);
      // What is left out: the rows above the header and the rows under the table.
      expect(a.leftOut).toEqual({ ...(t.leftOut.title ? { title: t.leftOut.title } : {}), ...(t.leftOut.footer ? { footer: t.leftOut.footer } : {}) });
      // The columns that look like merged cells, and the total rows.
      expect(a.fillDown?.value ?? []).toEqual(t.fillDown);
      expect((a.ignoreRows?.value ?? []).map((i) => i.column)).toEqual(t.ignoreRows.map((i) => i.column));
    });
  }

  it('the proposal, applied to the Input step, reads the rows of the truth (the whole point of it)', async () => {
    for (const layout of clearLayouts()) {
      const t = layout.truth!;
      const a = analyzeLayout(await gridOf(layout));
      const settings = { key: 'k', ...(t.sheet === undefined ? {} : { sheet: t.sheet }), ...proposalToSettings(a) };
      const table = await loadInputFile(runner, { name: layout.file.name, size: layout.file.bytes.length, blob: new Blob([layout.file.bytes as BlobPart]) }, parseInputSettings(settings, 'n'), `an_${Math.random().toString(36).slice(2, 8)}`);
      const rows = (await runner.query(`SELECT * FROM "${table.relation}"`)).rows;
      expect(table.columns.map((c) => c.name), layout.name).toEqual(t.columns);
      expect(rows.length, layout.name).toBe(t.rows.length);
      // Compare the first column and the amounts: the rows are the same rows, in the same order.
      rows.forEach((r, i) => {
        expect(r[0], `${layout.name} row ${i + 1}`).toBe(t.rows[i]![0]);
        expect(Number(r[3]), `${layout.name} row ${i + 1}`).toBeCloseTo(Number(t.rows[i]![3]), 9);
      });
    }
  }, 60_000);
});

describe('every ambiguous layout is analysed with low confidence and its alternatives', () => {
  it('two tables: the first is proposed with low confidence, and the other is listed with its place', async () => {
    for (const layout of ambiguousLayouts().filter((l) => l.name.startsWith('two-tables'))) {
      const a = analyzeLayout(await gridOf(layout));
      expect(a.found).toBe(true);
      expect(a.headerRow).toMatchObject({ value: layout.truth!.headerRow, confidence: 'low' });
      expect(a.headerRow!.reason.id).toBe('engine.layoutHeaderMany');
      expect(a.firstColumn!.confidence).toBe('low');
      expect(a.stopAt!.confidence).toBe('low');
      const other = (layout.ambiguity as { otherTables: { headerRow: number; firstColumn: number; lastColumn: number }[] }).otherTables;
      expect(a.otherTables.map((o) => ({ headerRow: o.headerRow, firstColumn: o.firstColumn, lastColumn: o.lastColumn }))).toEqual(other);
    }
  });
  it('a table that nothing ends: the stop rule is low confidence and says nothing marks the end', async () => {
    for (const layout of ambiguousLayouts().filter((l) => l.name.startsWith('no-end-marker'))) {
      const a = analyzeLayout(await gridOf(layout));
      expect(a.found).toBe(true);
      expect(a.stopAt).toMatchObject({ value: { kind: 'end' }, confidence: 'low' });
      expect(a.stopAt!.reason.id).toBe('engine.layoutStopEnd');
      expect(a.headerRow!.confidence).toBe('high'); // the header itself is clear
    }
  });
  it('a sheet of text only: no table, nothing is proposed, and it says so', async () => {
    for (const layout of ambiguousLayouts().filter((l) => l.name.startsWith('text-only'))) {
      const a = analyzeLayout(await readGrid(blob(layout)));
      expect(a.found).toBe(false);
      expect(a.noTable?.id).toBe('engine.layoutNoTable');
      expect(a.headerRow).toBeUndefined();
      expect(proposalToSettings(a)).toEqual({});
    }
  });
});

describe('chooseSheet', () => {
  const table = (rows: number, cols: number): Grid => ({ typed: true, truncated: false, rows: [Array.from({ length: cols }, (_, i) => `H${i}`), ...Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `v${r}${c}`))] });
  const text: Grid = { typed: true, truncated: false, rows: [['Notes'], ['Nothing here']] };
  const cand = (sheet: string, g: Grid) => ({ sheet, analysis: analyzeLayout(g) });
  it('takes the first sheet when it holds a table', () => {
    expect(chooseSheet([cand('A', table(3, 3)), cand('B', table(50, 8))])).toMatchObject({ value: 'A', confidence: 'high', reason: { id: 'engine.layoutSheetFirst' } });
  });
  it('takes the sheet with the largest table when the first holds none, and the first of two equal ones', () => {
    expect(chooseSheet([cand('Notes', text), cand('Small', table(3, 3)), cand('Big', table(20, 5)), cand('Same', table(20, 5))])).toMatchObject({ value: 'Big', confidence: 'medium', reason: { id: 'engine.layoutSheetLargest', params: { sheet: 'Big', rows: 20, columns: 5 } } });
  });
  it('proposes nothing when no sheet holds a table', () => {
    expect(chooseSheet([cand('Notes', text)])).toBeUndefined();
    expect(chooseSheet([])).toBeUndefined();
  });
});

describe('the analysis is deterministic and fast', () => {
  const bigGrid = (): Grid => {
    const rows: RawCell[][] = [['Title of the report'], [], ['Code', 'Label', 'Group', 'Amount', 'Day']];
    for (let i = 0; i < 1990; i++) rows.push([`K${i}`, `Item ${i}`, i % 2 === 0 ? 'North' : null, i * 1.5, new Date(Date.UTC(2026, 8, 1 + (i % 28)))]);
    rows.push([], ['Prepared by']);
    return { rows, typed: true, truncated: false };
  };
  it('gives the same answer twice', () => {
    expect(analyzeLayout(bigGrid())).toEqual(analyzeLayout(bigGrid()));
  });
  it('analyses 2,000 rows in under 2 seconds', () => {
    const started = performance.now();
    const a = analyzeLayout(bigGrid());
    expect(performance.now() - started).toBeLessThan(2000);
    expect(a.found).toBe(true);
    expect(a.stopAt!.value).toMatchObject({ kind: 'marker', text: 'Prepared by' });
  });
  it('reads at most 2,000 rows and 100 columns, and says when the sheet has more', () => {
    const rows: RawCell[][] = [Array.from({ length: 120 }, (_, i) => `H${i}`), ...Array.from({ length: 2500 }, (_, r) => Array.from({ length: 120 }, (_, c) => `v${r}.${c}`))];
    const a = analyzeLayout({ rows, typed: true, truncated: false });
    expect(a.rowsRead).toBe(2000);
    expect(a.truncated).toBe(true);
    expect(a.lastColumn!.value).toBe(100);
  });
  it('an xlsx file read with readGrid is analysed like the grid of its cells', async () => {
    const bytes = new Uint8Array(xlsxBytes([{ name: 'S', rows: [['A', 'B'], ['x', 'y'], ['z', 'w']] }]));
    const a = analyzeLayout(await readGrid(Object.assign(new Blob([bytes as BlobPart]), { name: 't.xlsx' })));
    expect(a.headerRow?.value).toBe(1);
    expect(a.region).toMatchObject({ firstColumn: 1, lastColumn: 2, lastRow: 3 });
  });
});

describe('the generator knows nothing that the app knows', () => {
  it('no value of the generated files is in src/ (the footer words are generic words, not data)', () => {
    const generated = ['Monthly list of items', 'Made-up data for tests', 'Period: September 2026', 'A. Maker', 'Danh sách mẫu', 'Exported from another system', 'Page 1 of 1', 'K001', 'Item 1', 'First list', 'Second list', 'Notes for the next meeting'];
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk('src');
    const hits = files.flatMap((f) => generated.filter((g) => readFileSync(f, 'utf8').includes(g)).map((g) => `${f}: ${g}`));
    expect(hits).toEqual([]);
  });
});
