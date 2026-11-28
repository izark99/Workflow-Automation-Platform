import * as XLSX from 'xlsx';
import type { FlowDefinition } from '../flow/types';
import { parseOutputSettings, type OutputSettings } from '../nodes/output';
import type { RunResult } from '../run';
import { coded, type Cell, type TableData } from '../types';
import { defaultPrintSettings, MAX_PRINT_ROWS, printIsOn } from './print/settings';
import type { PrintLanguage, PrintSheetInput } from './print/writer';

export interface OutputFile {
  /** File name with extension, safe for a download. */
  name: string;
  format: 'xlsx' | 'csv';
  mimeType: string;
  bytes: Uint8Array;
  /** Sheet names in order. Empty for csv. */
  sheets: string[];
  /** True when the file was written with a print layout (SPEC 16.1). Absent otherwise. */
  printed?: true;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv;charset=utf-8';

/** A plain number: no leading zeros (so `007` stays text), no exponent, no thousands marks. */
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_FORMAT = 'yyyy-mm-dd';
const EXCEL_EPOCH_OFFSET = 25569; // days from 1899-12-30 to 1970-01-01

/** Excel serial of an ISO date, computed in UTC, so the browser time zone cannot move it by a day. */
function serial(iso: string): number | undefined {
  const m = ISO_DATE.exec(iso);
  if (!m) return undefined;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 + EXCEL_EPOCH_OFFSET;
}

function toSheet(table: TableData, settings: OutputSettings): XLSX.WorkSheet {
  const numberLike = new Set(settings.numberLikeText);
  const ws: XLSX.WorkSheet = {};
  const widths = table.columns.map((c) => c.name.length);
  table.columns.forEach((c, col) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: col })] = { t: 's', v: c.name };
  });
  table.rows.forEach((row, i) => {
    table.columns.forEach((c, col) => {
      const v = row[col] ?? null;
      let cell: XLSX.CellObject | undefined;
      if (v === null || v === '') cell = undefined; // a blank cell is absent
      else if (c.type === 'number') cell = { t: 'n', v: Number(v) };
      else if (c.type === 'boolean') cell = { t: 'b', v: Boolean(v) };
      else if (c.type === 'date') {
        const s = serial(String(v));
        cell = s === undefined ? { t: 's', v: String(v) } : { t: 'n', v: s, z: DATE_FORMAT };
      } else if (numberLike.has(c.name) && PLAIN_NUMBER.test(String(v))) cell = { t: 'n', v: Number(v) };
      else cell = { t: 's', v: String(v) };
      if (cell) {
        ws[XLSX.utils.encode_cell({ r: i + 1, c: col })] = cell;
        if (i < 200) widths[col] = Math.max(widths[col]!, String(cell.v).length);
      }
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.rows.length, c: Math.max(0, table.columns.length - 1) } });
  ws['!cols'] = widths.map((w) => ({ wch: Math.min(50, Math.max(8, w + 2)) }));
  return ws;
}

function csvField(v: Cell, type: string): string {
  if (v === null || v === '') return '';
  const text = type === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(table: TableData): Uint8Array {
  const lines = [table.columns.map((c) => csvField(c.name, 'text')).join(',')];
  for (const row of table.rows) lines.push(table.columns.map((c, i) => csvField(row[i] ?? null, c.type)).join(','));
  // A byte order mark lets Excel read the accents of a UTF-8 file correctly.
  return new TextEncoder().encode(`\uFEFF${lines.join('\r\n')}\r\n`);
}

/** What the print layouts need that the run result does not hold (SPEC 16.1 item 4). All of it is optional. */
export interface OutputOptions {
  flowName?: string;
  /** ISO dates. The run date is today when it is not given. */
  effectiveDate?: string;
  runDate?: string;
  /** The values of the parameters as the text that is printed. */
  parameters?: Readonly<Record<string, string>>;
  language?: PrintLanguage;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');

/**
 * Builds the files of the Output steps of a finished run. Steps with the same `file` become the sheets of one
 * workbook, in step order; csv files hold one table. Types are kept: numbers, dates (serials with a date format),
 * booleans and text; blank cells are absent. See D27.
 */
export async function buildOutputFiles(result: RunResult, flow: Pick<FlowDefinition, 'nodes'>, options: OutputOptions = {}): Promise<OutputFile[]> {
  const steps = flow.nodes.filter((n) => n.type === 'output');
  if (steps.length === 0) {
    throw coded('invalid_flow', 'engine.noOutputStep');
  }
  const files = new Map<string, { settings: OutputSettings; table: TableData }[]>();
  for (const node of steps) {
    const settings = parseOutputSettings(node.settings, node.id);
    const table = await result.rows(node.id, 'result');
    files.set(settings.file, [...(files.get(settings.file) ?? []), { settings, table }]);
  }

  const out: OutputFile[] = [];
  for (const [file, parts] of files) {
    if (parts[0]!.settings.format === 'csv') {
      out.push({ name: `${safeName(file)}.csv`, format: 'csv', mimeType: CSV_MIME, bytes: toCsv(parts[0]!.table), sheets: [] });
      continue;
    }
    const printed = parts.filter((p) => p.settings.print !== undefined && printIsOn(p.settings.print));
    let bytes: Uint8Array;
    if (printed.length === 0) {
      const wb = XLSX.utils.book_new();
      for (const { settings, table } of parts) XLSX.utils.book_append_sheet(wb, toSheet(table, settings), settings.sheet);
      bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    } else {
      bytes = await writePrinted(parts, options);
    }
    out.push({ name: `${safeName(file)}.xlsx`, format: 'xlsx', mimeType: XLSX_MIME, bytes, sheets: parts.map((p) => p.settings.sheet!), ...(printed.length > 0 ? { printed: true as const } : {}) });
  }
  return out;
}

/** The workbook of a file that has at least one print layout: each sheet with its layout, the others plain. ExcelJS is loaded here only. */
async function writePrinted(parts: { settings: OutputSettings; table: TableData }[], options: OutputOptions): Promise<Uint8Array> {
  const today = new Date().toISOString().slice(0, 10);
  const sheets: PrintSheetInput[] = parts.map(({ settings, table }) => {
    const name = settings.sheet ?? settings.file;
    const on = settings.print !== undefined && printIsOn(settings.print);
    if (on && table.rows.length > MAX_PRINT_ROWS) {
      throw coded('invalid_settings', 'engine.printTooManyRows', { sheet: name, rows: table.rows.length.toLocaleString('en-US'), max: MAX_PRINT_ROWS.toLocaleString('en-US') });
    }
    return {
      name,
      table,
      numberLikeText: settings.numberLikeText,
      // A sheet without a layout is written plain: the defaults with the switch off, which the writer draws as a table only.
      print: on ? settings.print! : { ...defaultPrintSettings(), enabled: false, pageNumbers: false, repeatHeader: false, fitWidth: false },
      tokens: { effectiveDate: options.effectiveDate ?? today, runDate: options.runDate ?? today, flow: options.flowName ?? '', rows: table.rows.length, params: options.parameters ?? {} },
    };
  });
  const { buildPrintWorkbook } = await import('./print/writer');
  return buildPrintWorkbook(sheets, options.language ?? 'vi');
}
