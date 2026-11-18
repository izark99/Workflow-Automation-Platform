// Streaming xlsx reader: rows of one sheet, read without loading the workbook into memory.
import { SAVE_AS_HINT, XlsxReadError } from './errors';
import { parseDateStyles, parseSheetList, readSharedStrings, entryOrThrow } from './parts';
import { parseSheetRows, type XlsxRow } from './sheet';
import { openEntry, readEntryText, readZipDirectory, textChunks } from './zip';

export { XlsxReadError } from './errors';
export type { XlsxRow, CellValue } from './sheet';

export interface ReadXlsxOptions {
  /** Sheet to read. The first sheet of the workbook is the default. */
  sheetName?: string;
}

export async function* readXlsx(blob: Blob, options: ReadXlsxOptions = {}): AsyncGenerator<XlsxRow> {
  const entries = await readZipDirectory(blob);
  const workbook = await readEntryText(blob, entryOrThrow(entries, 'xl/workbook.xml'));
  const rels = await readEntryText(blob, entryOrThrow(entries, 'xl/_rels/workbook.xml.rels'));
  const sheets = parseSheetList(workbook, rels);
  const sheet = options.sheetName === undefined ? sheets[0]! : sheets.find((s) => s.name === options.sheetName);
  if (!sheet) {
    const names = sheets.map((s) => s.name).join(', ');
    throw new XlsxReadError(`Sheet "${options.sheetName}" was not found. Sheets in this file: ${names}. Pick one of them.`);
  }
  const stylesEntry = entries.get('xl/styles.xml');
  const dateStyles = stylesEntry ? parseDateStyles(await readEntryText(blob, stylesEntry)) : [];
  const sstEntry = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sstEntry ? await readSharedStrings(await openEntry(blob, sstEntry)) : [];
  const sheetEntry = entries.get(sheet.path);
  if (!sheetEntry) {
    throw new XlsxReadError(`The sheet "${sheet.name}" is listed in the file but its data is missing. ${SAVE_AS_HINT}`);
  }
  yield* parseSheetRows(textChunks(await openEntry(blob, sheetEntry)), { sharedStrings, dateStyles });
}
