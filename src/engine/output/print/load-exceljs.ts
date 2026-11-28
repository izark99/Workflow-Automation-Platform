// ExcelJS writes an xlsx sheet that has a print layout (SPEC 16.1). It is the one place that loads it, and only through a dynamic
// import, so it is a separate file of the build that is requested only when a workbook has a print layout. Nothing else may
// import `exceljs` (a test checks).
export type ExcelJSModule = typeof import('exceljs');

let loaded: Promise<ExcelJSModule> | null = null;

/** Loads ExcelJS once. The first call requests the file; a normal workbook never calls this. */
export function loadExcelJS(): Promise<ExcelJSModule> {
  loaded ??= import('exceljs').then((m) => ((m as unknown as { default?: ExcelJSModule }).default ?? m));
  return loaded;
}
