import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadExcelJS } from './load-exceljs';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('ExcelJS is loaded only when a print layout needs it', () => {
  it('no file of src imports exceljs except through a dynamic import in load-exceljs.ts (so it stays a separate file of the build)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      const staticImport = /(^|\n)\s*(import|export)\b[^;\n]*from\s+['"]exceljs(\/[^'"]*)?['"]/.test(text);
      const dynamic = /import\(\s*['"]exceljs/.test(text);
      // A type-only import is erased by the compiler and never reaches the build.
      const onlyTypes = staticImport && !/(^|\n)\s*(import|export)\s+(?!type\b)[^;\n]*from\s+['"]exceljs/.test(text);
      if ((staticImport && !onlyTypes) || (dynamic && !file.endsWith('load-exceljs.ts'))) offenders.push(file.slice(SRC.length));
    }
    expect(offenders).toEqual([]);
  });

  it('loads the module once and gives the same promise for every call', async () => {
    const first = loadExcelJS();
    expect(loadExcelJS()).toBe(first);
    const excel = await first;
    expect(typeof excel.Workbook).toBe('function');
  });

  it('can write a workbook that a reader opens', async () => {
    const excel = await loadExcelJS();
    const wb = new excel.Workbook();
    wb.addWorksheet('A').addRow(['x', 1]);
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
