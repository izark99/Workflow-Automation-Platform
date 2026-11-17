import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { DATASETS } from './datasets';
import { runDataset } from './helpers';

// Proof that the acceptance harness works and that it can fail. A pass-through flow runs in the real browser; its
// output is compared with the input workbook, which is read by another route (SheetJS on the test side). Then the
// same output is damaged in several ways, and every damage must be found.
const ds = { ...DATASETS[0]!, inputs: { Employees: 'input/employees.xlsx' } };
const flow = {
  schemaVersion: 1,
  nodes: [
    { id: 'in', type: 'input_file', settings: { key: 'Employees', sheet: 'Employees' } },
    { id: 'out', type: 'output', settings: { file: 'Result', sheet: 'Employees' } },
  ],
  edges: [{ source: 'in', target: 'out' }],
};
const SHEETS = ['Employees'];

async function actualBytes(page: import('@playwright/test').Page): Promise<Uint8Array> {
  const ran = await runDataset(page, flow, ds);
  expect(ran.files.map((f) => f.name)).toEqual(['Result.xlsx']);
  return ran.files[0]!.bytes;
}
const expectedBook = () => readWorkbook(new Uint8Array(readFileSync(path.join(ds.dir, 'input/employees.xlsx'))));

test('a correct run is found equal, in a UTC+7 browser', async ({ page }) => {
  // The browser reports the same zone as Asia/Saigon, so check the offset: UTC+7 is -420 minutes.
  const offset = await page.evaluate(() => new Date(2026, 8, 30).getTimezoneOffset());
  expect(offset).toBe(-420);
  const comparison = compareWorkbooks(expectedBook(), readWorkbook(await actualBytes(page)), SHEETS);
  expect(comparison.ok, formatComparison(comparison)).toBe(true);
  expect(comparison.comparedCells).toBeGreaterThan(20);
});

test('every kind of damage to the output is found', async ({ page }) => {
  const bytes = await actualBytes(page);
  const expected = expectedBook();
  const damage: Record<string, (wb: XLSX.WorkBook) => void> = {
    'a changed text value': (wb) => {
      wb.Sheets.Employees!.B2!.v = `${String(wb.Sheets.Employees!.B2!.v)} X`;
    },
    'a renamed header': (wb) => {
      wb.Sheets.Employees!.A1!.v = 'Employee id';
    },
    'a missing last row': (wb) => {
      const ws = wb.Sheets.Employees!;
      const r = XLSX.utils.decode_range(ws['!ref']!);
      ws['!ref'] = XLSX.utils.encode_range({ s: r.s, e: { r: r.e.r - 1, c: r.e.c } });
    },
    'a date moved by one day': (wb) => {
      const cell = wb.Sheets.Employees!.C2!;
      cell.v = new Date((cell.v as Date).getTime() + 86_400_000);
    },
    'a date turned into a number': (wb) => {
      const cell = wb.Sheets.Employees!.C2!;
      cell.t = 'n';
      cell.v = 46000;
    },
    'a blank cell filled': (wb) => {
      const ws = wb.Sheets.Employees!;
      const blank = Object.keys(ws).find((a) => !a.startsWith('!') && ws[a]!.t === 'z');
      const address = blank ?? 'D50';
      ws[address] = { t: 's', v: 'filled' };
      const r = XLSX.utils.decode_range(ws['!ref']!);
      ws['!ref'] = XLSX.utils.encode_range({ s: r.s, e: { r: Math.max(r.e.r, XLSX.utils.decode_cell(address).r), c: Math.max(r.e.c, XLSX.utils.decode_cell(address).c) } });
    },
    'a renamed sheet': (wb) => {
      wb.Sheets.Renamed = wb.Sheets.Employees!;
      delete wb.Sheets.Employees;
      wb.SheetNames = ['Renamed'];
    },
  };
  for (const [name, apply] of Object.entries(damage)) {
    const wb = readWorkbook(bytes);
    apply(wb);
    const comparison = compareWorkbooks(expected, wb, SHEETS);
    expect(comparison.ok, `${name} was not found`).toBe(false);
    console.log(`${name}: ${comparison.differences[0]?.message}`);
  }
});
