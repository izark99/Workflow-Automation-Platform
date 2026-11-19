import { engineText } from '../messages';
import type { MessageParams } from '../messages';
import { coded } from '../types';
import { checkFileSize } from '../size-guard';
import { listXlsxSheets, readXlsx } from '../xlsx-stream';
import type { CellValue } from '../xlsx-stream';
import { parseCsv } from './csv';
import type { Grid, RawCell } from './types';

export type FileKind = 'xlsx' | 'csv';

/** The kind of a file by its name. Anything else is refused with a message that says which files are accepted. */
export function fileKind(name: string): FileKind {
  if (/\.xlsx$/i.test(name)) return 'xlsx';
  if (/\.csv$/i.test(name)) return 'csv';
  throw coded('file_read_failed', 'refimport.notTableFile', { name });
}

/** The sheets of a file. A csv file has none to choose from. */
export async function listSheets(file: Blob & { name: string }): Promise<string[]> {
  if (fileKind(file.name) === 'csv') return [];
  tooLargeCheck(file);
  return listXlsxSheets(file);
}

function tooLargeCheck(file: { name: string; size: number }): void {
  const size = checkFileSize(file);
  if (size.ok) return;
  const mb = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;
  const params: MessageParams = { fileName: file.name, size: mb(size.sizeBytes), limit: mb(size.limitBytes) };
  throw coded('file_too_large', 'engine.fileTooLarge', params);
}

const cell = (v: CellValue): RawCell => {
  if (v === undefined) return null;
  return v;
};

export interface ReadGridOptions {
  /** The sheet of an xlsx file. The first sheet is the default. */
  sheet?: string;
  /** Stop after this many rows (the preview needs 20, the import needs one more than the limit). */
  maxRows?: number;
}

/** Reads the cells of a csv file or of one sheet of an xlsx file. */
export async function readGrid(file: Blob & { name: string }, options: ReadGridOptions = {}): Promise<Grid> {
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  if (fileKind(file.name) === 'csv') {
    const rows = parseCsv(await file.text(), { maxRows: maxRows + 1 });
    const truncated = rows.length > maxRows;
    return { rows: (truncated ? rows.slice(0, maxRows) : rows) as RawCell[][], typed: false, truncated };
  }
  tooLargeCheck(file);
  const rows: RawCell[][] = [];
  let truncated = false;
  for await (const r of readXlsx(file, options.sheet === undefined ? {} : { sheetName: options.sheet })) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    // Rows without cells are reported with an empty list; the sheet row number is the index plus one.
    while (rows.length < r.row - 1) rows.push([]);
    rows.push(r.cells.map(cell));
  }
  return { rows, typed: true, truncated };
}

/** The English text of a problem, for tests and logs. The UI uses the catalog. */
export const problemText = engineText;
