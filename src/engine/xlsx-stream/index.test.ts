import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readXlsx, XlsxReadError, type XlsxRow } from './index';

function workbookBlob(build: (wb: XLSX.WorkBook) => void): Blob {
  const wb = XLSX.utils.book_new();
  build(wb);
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer;
  return new Blob([bytes]);
}

async function readAll(blob: Blob, sheetName?: string): Promise<XlsxRow[]> {
  const rows: XlsxRow[] = [];
  for await (const r of readXlsx(blob, sheetName ? { sheetName } : {})) rows.push(r);
  return rows;
}

describe('readXlsx', () => {
  it('reads text, numbers, booleans, empty cells and special characters like SheetJS does', async () => {
    const aoa = [
      ['Name', 'Qty', 'Flag', 'Note'],
      ['A & B', 1.25, true, 'he said "hi" <ok>'],
      ['Ünïcode ✓', -3, false, ''],
      ['', 0, undefined, 'last'],
    ];
    const blob = workbookBlob((wb) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Data'));
    const ours = (await readAll(blob)).map((r) => r.cells);
    const wb2 = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const oracle = XLSX.utils.sheet_to_json<unknown[]>(wb2.Sheets['Data']!, { header: 1, raw: true });
    // An empty string and a missing cell mean the same here, and trailing gaps are not kept.
    const normalize = (rows: unknown[][]) =>
      rows.map((r) => {
        const cells = Array.from(r, (c) => (c === '' ? undefined : c));
        while (cells.length > 0 && cells[cells.length - 1] === undefined) cells.pop();
        return cells;
      });
    expect(normalize(ours)).toEqual(normalize(oracle));
    expect(ours[1]).toEqual(['A & B', 1.25, true, 'he said "hi" <ok>']);
  });

  it('keeps Excel row numbers when rows are skipped', async () => {
    const blob = workbookBlob((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([['h'], [1]]);
      ws['A5'] = { t: 'n', v: 9 };
      ws['!ref'] = 'A1:A5';
      XLSX.utils.book_append_sheet(wb, ws, 'S');
    });
    const rows = await readAll(blob);
    expect(rows.map((r) => r.row)).toEqual([1, 2, 5]);
  });

  it('reads dates as Date values and plain numbers as numbers', async () => {
    const d = new Date(Date.UTC(2026, 8, 30));
    const blob = workbookBlob((wb) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['when', 'n'], [d, 45000]], { cellDates: true }), 'S'),
    );
    const row2 = (await readAll(blob))[1]!.cells;
    expect(row2[0]).toBeInstanceOf(Date);
    expect(Math.abs((row2[0] as Date).getTime() - d.getTime())).toBeLessThan(86_400_000);
    expect(row2[1]).toBe(45000);
  });

  it('reads the first sheet by default and a named sheet on request', async () => {
    const blob = workbookBlob((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['first']]), 'One');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['second']]), 'Two');
    });
    expect((await readAll(blob))[0]!.cells).toEqual(['first']);
    expect((await readAll(blob, 'Two'))[0]!.cells).toEqual(['second']);
  });

  it('says what failed and what to do when the sheet name is unknown', async () => {
    const blob = workbookBlob((wb) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'One'));
    await expect(readAll(blob, 'Nope')).rejects.toThrow(/Sheet "Nope" was not found.*One/);
  });

  it('rejects a file that is not a zip with an actionable message', async () => {
    const err = await readAll(new Blob(['plain text, not an xlsx file'])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(XlsxReadError);
    expect((err as Error).message).toMatch(/not a valid .xlsx.*save/i);
  });
});
