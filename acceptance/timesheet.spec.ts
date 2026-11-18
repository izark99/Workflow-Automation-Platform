import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { auditRequests } from '../scripts/lib/request-audit';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { COMPARED_SHEETS, DATASETS, TIMESHEET_FLOW } from './datasets';
import { allowedCodeUrls, runDataset, watchRequests } from './helpers';

// Gate G1: one flow file, run through the real engine in Chromium, must give the expected workbook cell by cell
// for both datasets.
for (const ds of DATASETS) {
  test(`monthly timesheet flow matches the expected workbook: ${ds.name}`, async ({ page }) => {
    if (!existsSync(TIMESHEET_FLOW)) {
      throw new Error(`${TIMESHEET_FLOW} does not exist yet. Tasks T1.18 and T1.19 create it.`);
    }
    const flow = JSON.parse(readFileSync(TIMESHEET_FLOW, 'utf8'));
    const requests = watchRequests(page);
    const ran = await runDataset(page, flow, ds);
    const workbook = ran.files.find((f) => f.name.endsWith('.xlsx'));
    expect(workbook, 'the flow wrote no xlsx file').toBeDefined();

    const expected = readWorkbook(new Uint8Array(readFileSync(path.join(ds.dir, ds.expectedFile))));
    const comparison = compareWorkbooks(expected, readWorkbook(workbook!.bytes), COMPARED_SHEETS);
    console.log(`${ds.name} (effective date ${ds.effectiveDate}): ${formatComparison(comparison)}`);
    expect(comparison.ok, formatComparison(comparison)).toBe(true);

    // The same run must not have sent the content of its files anywhere: the names of the employee list are the markers.
    const names = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(
        XLSX.read(readFileSync(path.join(ds.dir, ds.inputs.Employees!))).Sheets.Employees!,
      )
      .map((r) => String(r['Full name'] ?? ''))
      .filter((n) => n.length >= 5);
    expect(names.length).toBeGreaterThan(5);
    expect(auditRequests(requests, 'http://localhost:4176', names, allowedCodeUrls())).toEqual([]);
  });
}
