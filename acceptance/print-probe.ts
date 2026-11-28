// A probe for `npm run perf:print` (T9.1): writes a report of `rows` x 12 columns with ExcelJS in the way a print layout does
// (a border on every cell, a styled header row, number and date formats, the page set to fit one page wide, a repeated header row)
// and says how long it took and how much memory the page used. The real writer (T9.3) replaces it in the numbers of T9.16.
import { loadExcelJS } from '../src/engine/output/print/load-exceljs';

export interface PrintProbeResult {
  rows: number;
  ms: number;
  bytes: number;
  /** Largest used JS heap seen while writing, in MB (Chromium with precise memory info). */
  peakHeapMb: number;
  /** The time that the first load of ExcelJS took, in ms (0 when it was loaded before). */
  loadMs: number;
}

const THIN = { style: 'thin' as const, color: { argb: 'FF999999' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

declare global {
  interface Window {
    printProbe: (rows: number) => Promise<PrintProbeResult>;
  }
}

window.printProbe = async (rows) => {
  const t0 = performance.now();
  const ExcelJS = await loadExcelJS();
  const loadMs = performance.now() - t0;
  const heap = (): number => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
  let peak = heap();
  const timer = window.setInterval(() => (peak = Math.max(peak, heap())), 20);
  const start = performance.now();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } }, views: [{ showGridLines: false }] });
  const names = ['Id', 'Name', 'Department', 'Hours', 'OT hours', 'Rate', 'Amount', 'Bonus', 'Tax', 'Net', 'Day', 'Note'];
  ws.addRow(names);
  for (let r = 0; r < rows; r++) {
    ws.addRow([`E${r + 1}`, `Nguyễn Văn ${r % 97}`, `Phòng ${r % 13}`, 8 + (r % 5), r % 4, 120000 + (r % 7) * 1000, 960000 + r, r % 3 === 0 ? 50000 : 0, 10000 + (r % 11), 900000 + r, new Date(Date.UTC(2026, 8, 1 + (r % 28))), r % 9 === 0 ? 'A longer note that has to wrap inside its cell when the sheet is printed' : '']);
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  ws.pageSetup.printTitlesRow = '1:1';
  ws.columns.forEach((c, i) => {
    c.width = i === 11 ? 40 : i === 1 ? 22 : 12;
    if ([3, 4, 5, 6, 7, 8, 9].includes(i)) c.numFmt = '#,##0';
    if (i === 10) c.numFmt = 'dd/mm/yyyy';
  });
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = BORDER;
      if (Number(cell.col) === 12) cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });
  const buffer = await wb.xlsx.writeBuffer();
  const ms = performance.now() - start;
  window.clearInterval(timer);
  peak = Math.max(peak, heap());
  return { rows, ms, bytes: buffer.byteLength, peakHeapMb: peak, loadMs };
};
