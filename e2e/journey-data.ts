// Data and helpers for the G3 journeys. The real timesheet flow and the real reference tables are brought into the local
// store from flows/ and testcase/ by the test (never from src/), the same files that the acceptance gate uses.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { DATASETS, TIMESHEET_FLOW } from '../acceptance/datasets';
import type { DatasetConfig } from '../acceptance/helpers';
import type { Cell, Column, ColumnType } from '../src/engine/types';
import { seedSnapshot } from '../src/store/seed';

export { DATASETS };
export type { DatasetConfig };

/** A sheet as a reference table: the first row is the header, types follow the cells (all numbers, all dates, else text). */
function sheetToTable(ws: XLSX.WorkSheet): { columns: Column[]; rows: Cell[][] } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const header = (aoa[0] ?? []).map(String);
  const body = aoa.slice(1);
  const columns: Column[] = header.map((name, c) => {
    const values = body.map((row) => row[c]).filter((v) => v !== null && v !== '');
    let type: ColumnType = 'text';
    if (values.length > 0 && values.every((v) => typeof v === 'number')) type = 'number';
    else if (values.length > 0 && values.every((v) => v instanceof Date)) type = 'date';
    return { name, type };
  });
  const rows: Cell[][] = body.map((row) =>
    columns.map((col, c) => {
      const v = row[c] ?? null;
      if (v === null || v === '') return null;
      if (col.type === 'number') return v as number;
      if (col.type === 'date') return (v as Date).toISOString().slice(0, 10);
      return String(v);
    }),
  );
  return { columns, rows };
}

/** Puts the monthly timesheet flow (published) and its three reference tables into the store before the page loads. */
export async function seedTimesheet(page: Page, ds: DatasetConfig): Promise<void> {
  const s = seedSnapshot();
  const wb = XLSX.read(readFileSync(path.join(ds.dir, ds.referenceFile ?? 'reference/reference_tables.xlsx')), { type: 'buffer', cellDates: true });
  for (const name of ds.referenceSheets ?? []) {
    const t = sheetToTable(wb.Sheets[name]!);
    s.refTables.push({ id: `ref-${name}`, name, description: 'From the test case.', versions: [{ versionNo: 1, validFrom: ds.referenceValidFrom ?? '2026-01-01', validTo: null, status: 'published', columns: t.columns, rows: t.rows }] });
  }
  s.flows.push({
    id: 'flow-ts',
    name: 'Timesheet journey',
    ownerId: 'user-harold',
    scope: 'personal',
    deletedAt: null,
    groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: 'First version', definition: JSON.parse(readFileSync(TIMESHEET_FLOW, 'utf8')) }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}

/** The keys that move a date picker from `from` (an ISO date, as today) to `to` within the same year or the neighbouring ones. */
export function dateKeys(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm);
  const keys: string[] = Array.from({ length: Math.abs(months) }, () => (months < 0 ? 'PageUp' : 'PageDown'));
  const delta = td - fd; // inside the target month for days 3 to 28 and the 30th of a month that has one
  for (let i = 0; i < Math.abs(delta); i++) keys.push(delta < 0 ? 'ArrowLeft' : 'ArrowRight');
  return keys;
}

/** Opens a date picker and moves to a date with the keyboard, as a user would. */
export async function pickDate(page: Page, trigger: RegExp, from: string, to: string): Promise<void> {
  await page.getByRole('button', { name: trigger }).click();
  for (const k of dateKeys(from, to)) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
}

/** Signs in as another seeded user: the store keeps the signed-in user in its snapshot, so the snapshot is changed and the page reloaded. */
export async function signInAs(page: Page, userId: string): Promise<void> {
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('data-flow-webapp', 1);
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction('snapshot', 'readwrite');
          const store = tx.objectStore('snapshot');
          const get = store.get('v1');
          get.onsuccess = () => {
            const snap = get.result as { currentUserId: string };
            snap.currentUserId = id;
            store.put(snap, 'v1');
          };
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error('write failed'));
        };
      }),
    userId,
  );
  await page.reload();
}
