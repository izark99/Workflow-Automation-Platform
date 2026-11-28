import { describe, expect, it } from 'vitest';
import { previewPages } from './preview-model';
import type { PreviewInput } from './preview-model';
import { defaultPrintSettings } from './settings';

const tokens = { effectiveDate: '2026-09-30', runDate: '2026-10-05', flow: 'Timesheet', rows: 0, params: {} };
const rowsOf = (from: number, n: number): string[][] => Array.from({ length: n }, (_, i) => [`E${from + i}`, 'x']);
const make = (total: number, over: Partial<PreviewInput> = {}, print = defaultPrintSettings()): PreviewInput => ({
  print, tokens: { ...tokens, rows: total }, language: 'vi', columns: ['Id', 'Name'],
  firstRows: rowsOf(1, Math.min(100, total)), lastRows: rowsOf(Math.max(1, total - 99), Math.min(100, total)), totalRows: total, ...over,
});
const withBlock = { ...defaultPrintSettings(), header: [{ text: 'REPORT {month_year}', align: 'center' as const, bold: true, size: 'large' as const }], dateLine: 'Ngày {day}', signers: [{ title: 'Maker', line: '(Ký)', name: '' }] };

describe('the print preview model', () => {
  it('a short table is one page with the lines, the table, the block and the footer, and no last page', () => {
    const r = previewPages(make(10, {}, withBlock));
    expect(r.pages).toBe(1);
    expect(r.last).toBeNull();
    expect(r.first.lines[0]!.text).toBe('REPORT 09/2026');
    expect(r.first.header).toEqual(['Id', 'Name']);
    expect(r.first.rows).toHaveLength(10);
    expect(r.first.gapAfter).toBe(false);
    expect(r.first.signature?.dateLine).toBe('Ngày 05');
    expect(r.first.footer).toBe('Trang 1/1');
  });
  it('a long table has a first page with a gap after its rows, and a last page with the tail rows, the block and "Trang n/N"', () => {
    const r = previewPages(make(500, {}, withBlock));
    expect(r.pages).toBeGreaterThan(1);
    expect(r.first.gapAfter).toBe(true);
    expect(r.first.signature).toBeNull();
    expect(r.first.footer).toBe(`Trang 1/${r.pages}`);
    expect(r.last!.number).toBe(r.pages);
    expect(r.last!.header).toEqual(['Id', 'Name']);
    expect(r.last!.gapBefore).toBe(true);
    expect(r.last!.signature).not.toBeNull();
    expect(r.last!.rows.at(-1)).toEqual(['E500', 'x']);
  });
  it('the number of pages follows the paper and the orientation: A3 holds more rows than A4', () => {
    const a4 = previewPages(make(300)).pages;
    const a3 = previewPages(make(300, {}, { ...defaultPrintSettings(), paper: 'A3' })).pages;
    expect(a3).toBeLessThan(a4);
  });
  it('a block that does not fit on the last page opens a page of its own with the header row repeated and no rows', () => {
    const print = { ...withBlock, signers: [{ title: 'A', line: '(Ký)', name: 'n' }] };
    // Find a row count whose last page is full: search the first count that makes the block a page of its own.
    let found = false;
    for (let n = 30; n < 120 && !found; n++) {
      const r = previewPages(make(n, {}, print));
      if (r.last && r.last.rows.length === 0 && r.last.signature) {
        found = true;
        expect(r.last.header).toEqual(['Id', 'Name']);
        expect(r.last.number).toBe(r.pages);
      }
    }
    expect(found).toBe(true);
  });
  it('the footer is in English for the English app, and absent with the page numbers off', () => {
    expect(previewPages(make(10, { language: 'en' })).first.footer).toBe('Page 1/1');
    expect(previewPages(make(10, {}, { ...defaultPrintSettings(), pageNumbers: false })).first.footer).toBeNull();
  });
  it('an empty table is one page with the header row and the block', () => {
    const r = previewPages(make(0, {}, withBlock));
    expect(r.pages).toBe(1);
    expect(r.first.rows).toEqual([]);
    expect(r.first.signature).not.toBeNull();
  });
  it('the page has the ratio of the paper: landscape is wider than tall, portrait is not', () => {
    expect(previewPages(make(5)).first.ratio).toBeLessThan(1);
    expect(previewPages(make(5, {}, { ...defaultPrintSettings(), orientation: 'landscape' })).first.ratio).toBeGreaterThan(1);
  });
});
