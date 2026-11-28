// A probe for `npm run perf:print`: writes a report of `rows` x 12 columns with the real writer of a print layout (T9.3 to T9.4: the table with
// its borders, styles and formats, two header lines, the page setup, a repeated header row, the signature block with a page-break check, the
// footer) and says how long it took and how much memory the page used. T9.1 measured the same with a hand-written copy; T9.16 uses the writer.
import { loadExcelJS } from '../src/engine/output/print/load-exceljs';
import { defaultPrintSettings } from '../src/engine/output/print/settings';
import { buildPrintWorkbook } from '../src/engine/output/print/writer';
import type { TableData } from '../src/engine/types';

export interface PrintProbeResult {
  rows: number;
  ms: number;
  bytes: number;
  /** Largest used JS heap seen while writing, in MB (Chromium with precise memory info). */
  peakHeapMb: number;
  /** The time that the first load of ExcelJS took, in ms (0 when it was loaded before). */
  loadMs: number;
}

declare global {
  interface Window {
    printProbe: (rows: number) => Promise<PrintProbeResult>;
  }
}

window.printProbe = async (rows) => {
  const t0 = performance.now();
  await loadExcelJS();
  const loadMs = performance.now() - t0;
  const heap = (): number => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
  const names = ['Id', 'Name', 'Department', 'Hours', 'OT hours', 'Rate', 'Amount', 'Bonus', 'Tax', 'Net', 'Day', 'Note'];
  const types = ['text', 'text', 'text', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'date', 'text'] as const;
  const table: TableData = {
    columns: names.map((name, i) => ({ name, type: types[i]! })),
    rows: Array.from({ length: rows }, (_, r) => [
      `E${r + 1}`, `Nguyễn Văn ${r % 97}`, `Phòng ${r % 13}`, 8 + (r % 5), r % 4, 120000 + (r % 7) * 1000, 960000 + r, r % 3 === 0 ? 50000 : 0, 10000 + (r % 11), 900000 + r,
      `2026-09-${String(1 + (r % 28)).padStart(2, '0')}`, r % 9 === 0 ? 'A longer note that has to wrap inside its cell when the sheet is printed' : null,
    ]),
  };
  const print = {
    ...defaultPrintSettings(),
    orientation: 'landscape' as const,
    header: [{ text: 'MONTHLY REPORT {month_year}', align: 'center' as const, bold: true, size: 'large' as const }, { text: 'Flow: {flow} - {rows} rows', align: 'left' as const, bold: false, size: 'normal' as const }],
    dateLine: 'Ngày {day} tháng {month} năm {year}',
    signers: [{ title: 'Prepared by', line: '(Ký, ghi rõ họ tên)', name: '' }, { title: 'Approved by', line: '(Ký, ghi rõ họ tên)', name: '' }],
  };
  let peak = heap();
  const timer = window.setInterval(() => (peak = Math.max(peak, heap())), 20);
  const start = performance.now();
  const bytes = await buildPrintWorkbook([{ name: 'Report', table, numberLikeText: [], print, tokens: { effectiveDate: '2026-09-30', runDate: '2026-10-05', flow: 'Probe', rows, params: {} } }], 'vi');
  const ms = performance.now() - start;
  window.clearInterval(timer);
  peak = Math.max(peak, heap());
  return { rows, ms, bytes: bytes.byteLength, peakHeapMb: peak, loadMs };
};
