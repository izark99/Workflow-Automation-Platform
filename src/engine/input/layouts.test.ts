import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allLayouts, clearLayouts, type Layout, type TruthCell } from '../../../scripts/lib/layout-fixtures.ts';
import { xlsxBytes } from '../../../scripts/lib/refimport-fixtures.ts';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { loadInputFile, parseInputSettings, type FileSource } from './load';

// SPEC 13.2: a table inside a larger sheet is read with the region settings, from an xlsx file and from a csv file alike.
let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const source = (l: Layout): FileSource => ({ name: l.file.name, size: l.file.bytes.length, blob: new Blob([l.file.bytes as BlobPart]) });
let n = 0;
async function read(file: FileSource, settings: Record<string, unknown>, stats?: { rowsRead: number }): Promise<TableData> {
  const relation = `lay_${++n}`;
  const table = await loadInputFile(runner, file, parseInputSettings({ key: 'k', ...settings }, 'n'), relation, 'n', stats);
  const res = await runner.query(`SELECT * FROM "${table.relation}"`);
  return { columns: table.columns, rows: res.rows as TableData['rows'] };
}
const settingsOf = (l: Layout): Record<string, unknown> => {
  const t = l.truth!;
  return {
    ...(t.sheet === undefined ? {} : { sheet: t.sheet }),
    headerRow: t.headerRow,
    firstColumn: t.firstColumn,
    lastColumn: t.lastColumn,
    stopAt: t.stop,
    ignoreRows: t.ignoreRows,
    fillDown: t.fillDown,
  };
};
/** A cell as the truth writes it: a date (a Date, or the milliseconds that the Node runner gives) as `2026-09-30`. */
const plain = (v: unknown, type?: string): TruthCell => (v instanceof Date ? v.toISOString().slice(0, 10) : type === 'date' && typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : (v as TruthCell));

describe('every clear layout is read as its truth says, from xlsx and from csv', () => {
  for (const layout of clearLayouts()) {
    it(layout.name, async () => {
      const t = layout.truth!;
      const table = await read(source(layout), settingsOf(layout));
      expect(table.columns.map((c) => c.name)).toEqual(t.columns);
      expect(table.rows).toHaveLength(t.rows.length);
      table.rows.forEach((row, i) => {
        row.forEach((cell, c) => {
          const want = t.rows[i]![c]!;
          const got = plain(cell, table.columns[c]!.type);
          const same = want === null ? got === null : typeof want === 'number' ? Math.abs(Number(got) - want) < 1e-9 : got === want;
          expect(same, `${layout.name} row ${t.fileRows[i]} column ${t.columns[c]}: ${String(got)} vs ${String(want)}`).toBe(true);
        });
      });
      // The types are those of the table, not of the title or the footer.
      const type = (name: string) => table.columns.find((c) => c.name === name)!.type;
      expect(type('Amount')).toBe('number');
      expect(type('Day')).toBe('date');
      expect(type('Code')).toBe('text');
    });
  }
  it('an xlsx file and a csv file of the same layout give the same table', async () => {
    const all = clearLayouts();
    for (const x of all.filter((l) => l.format === 'xlsx')) {
      const c = all.find((l) => l.format === 'csv' && l.name.replace(' (csv)', '') === x.name.replace(' (xlsx)', ''))!;
      const [a, b] = [await read(source(x), settingsOf(x)), await read(source(c), settingsOf(c))];
      expect(a.columns.map((k) => k.name)).toEqual(b.columns.map((k) => k.name));
      expect(a.rows.map((r) => r.map((v, i) => plain(v, a.columns[i]!.type)))).toEqual(b.rows.map((r) => r.map((v, i) => plain(v, b.columns[i]!.type))));
    }
  });
});

describe('the stop rule', () => {
  const layout = clearLayouts().find((l) => l.name === 'title-and-footer (xlsx)')!;
  const base = { ...settingsOf(layout) };
  it('the end of the sheet (the default) reads the footer too, because nothing stops it', async () => {
    const all = await read(source(layout), { ...base, stopAt: { kind: 'end' } });
    expect(all.rows.length).toBeGreaterThan(layout.truth!.rows.length);
  });
  it('the first empty row stops at the blank row under the table', async () => {
    expect((await read(source(layout), { ...base, stopAt: { kind: 'blank_rows', count: 1 } })).rows).toHaveLength(6);
  });
  it('a count of empty rows needs that many in a row: one blank row does not stop a count of 2', async () => {
    const t = await read(source(layout), { ...base, stopAt: { kind: 'blank_rows', count: 2 } });
    expect(t.rows.length).toBeGreaterThan(6);
  });
  it('a fixed row reads up to and including that row', async () => {
    expect((await read(source(layout), { ...base, stopAt: { kind: 'row', row: 8 } })).rows).toHaveLength(3);
  });
  it('a marker is not case sensitive, and the row of the marker is not read', async () => {
    expect((await read(source(layout), { ...base, stopAt: { kind: 'marker', text: 'PREPARED', match: 'contains' } })).rows).toHaveLength(6);
  });
  it('a marker that is looked for in a column that is not in the file is an error that names the column', async () => {
    await expect(read(source(layout), { ...base, stopAt: { kind: 'marker', text: 'x', column: 'No such' } })).rejects.toThrow(/No such/);
  });
  it('a marker that is never found reads to the end of the sheet', async () => {
    const t = await read(source(layout), { ...base, stopAt: { kind: 'marker', text: 'never in this file', match: 'equals' } });
    expect(t.rows.length).toBeGreaterThan(6);
  });
});

describe('a footer of 100,000 rows is not read', () => {
  it('the xlsx reader stops after the marker: the rows consumed are those of the table and its title', async () => {
    const rows: (string | number | null)[][] = [['Title'], [], ['Code', 'Amount'], ...Array.from({ length: 5 }, (_, i) => [`K${i}`, i]), ['Prepared by'], ...Array.from({ length: 100_000 }, (_, i) => [`footer ${i}`, 'not a number'])];
    const bytes = new Uint8Array(xlsxBytes([{ name: 'Report', rows }]));
    const file: FileSource = { name: 'long.xlsx', size: bytes.length, blob: new Blob([bytes as BlobPart]) };
    const stats = { rowsRead: 0 };
    const table = await read(file, { sheet: 'Report', headerRow: 3, stopAt: { kind: 'marker', text: 'Prepared by' } }, stats);
    expect(table.rows).toHaveLength(5);
    expect(table.columns.find((c) => c.name === 'Amount')!.type).toBe('number');
    expect(stats.rowsRead).toBeLessThan(20);
  }, 120_000);
});

describe('the rows to ignore, the first and last column, and the row number', () => {
  const layout = clearLayouts().find((l) => l.name === 'totals-row (csv)')!;
  it('a row that has the text in the column is left out; one that does not is kept', async () => {
    const s = settingsOf(layout);
    expect((await read(source(layout), s)).rows).toHaveLength(6);
    expect((await read(source(layout), { ...s, ignoreRows: [{ column: 'Label', text: 'nothing like it' }] })).rows).toHaveLength(7);
    // The text is matched inside the cell, without regard to case.
    expect((await read(source(layout), { ...s, ignoreRows: [{ column: 'Label', text: 'SUBTOT' }] })).rows).toHaveLength(6);
    await expect(read(source(layout), { ...s, ignoreRows: [{ column: 'No such', text: 'x' }] })).rejects.toThrow(/No such/);
  });
  it('the last column cuts the region, and the row number column holds the row of the file', async () => {
    const s = settingsOf(layout);
    const t = await read(source(layout), { ...s, lastColumn: 'C', rowNumberColumn: 'file_row' });
    expect(t.columns.map((c) => c.name)).toEqual(['Code', 'Label', 'Group', 'file_row']);
    expect(t.rows.map((r) => r[3])).toEqual(layout.truth!.fileRows);
  });
});

describe('the footer text cannot change a column type', () => {
  it('a text under the table, after the blank row, is never read as an Amount', async () => {
    const rows = [['Code', 'Amount'], ['a', 1], ['b', 2.5], [null, null], ['Total', 'see the note']];
    const bytes = new Uint8Array(xlsxBytes([{ name: 'Report', rows }]));
    const file: FileSource = { name: 'f.xlsx', size: bytes.length, blob: new Blob([bytes as BlobPart]) };
    const t = await read(file, { sheet: 'Report', stopAt: { kind: 'blank_rows', count: 1 } });
    expect(t.columns.map((c) => c.type)).toEqual(['text', 'number']);
    expect(t.rows).toHaveLength(2);
  });
});

describe('the columns that the file must have', () => {
  const layout = clearLayouts().find((l) => l.name === 'later-row-and-column (xlsx)')!;
  const s = settingsOf(layout);
  it('are checked without regard to case or order, and extra columns are allowed', async () => {
    const t = await read(source(layout), { ...s, expect: ['amount', 'CODE'] });
    expect(t.rows.length).toBeGreaterThan(0);
  });
  it('a missing column stops the load with what is missing and what the file has, before any row is read', async () => {
    const stats = { rowsRead: 0 };
    const err = (await read(source(layout), { ...s, expect: ['Code', 'Stock', 'Price'] }, stats).catch((e: unknown) => e)) as EngineError;
    expect(err).toBeInstanceOf(EngineError);
    expect(err.messageId).toBe('engine.inputMissingColumns');
    expect(err.message).toContain('"Stock", "Price"');
    expect(err.message).toContain('Code, Label, Group, Amount, Day, Text day');
    expect(err.message).toContain(layout.file.name);
    // Only the rows up to the header were looked at (the sheet holds no empty rows, so fewer than the header's number).
    expect(stats.rowsRead).toBeGreaterThan(0);
    expect(stats.rowsRead).toBeLessThanOrEqual(layout.truth!.headerRow);
  });
  it('a csv file says the same', async () => {
    const csv = allLayouts().find((l) => l.name === 'later-row-and-column (csv)')!;
    const err = (await read(source(csv), { ...settingsOf(csv), expect: ['Missing one'] }).catch((e: unknown) => e)) as EngineError;
    expect(err.messageId).toBe('engine.inputMissingColumns');
  });
});
