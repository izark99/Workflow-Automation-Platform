import { describe, expect, it } from 'vitest';
import { defaultPrintSettings } from './settings';
import { printedDate, printTokenProblems, PRINT_TOKENS, replaceTokens, resolvedTexts, tokensIn } from './tokens';
import type { TokenContext } from './tokens';

const ctx: TokenContext = { effectiveDate: '2026-09-30', runDate: '2026-11-05', flow: 'Monthly timesheet', rows: 12345, params: { period: '09/2026', dept: 'Sản xuất' } };

describe('the tokens of a print layout', () => {
  it('names the tokens of SPEC 16.1 and day, month and year of the run date', () => {
    expect([...PRINT_TOKENS].sort()).toEqual(['day', 'effective_date', 'flow', 'month', 'month_year', 'rows', 'run_date', 'year']);
  });

  it('replaces each token: the effective date as 30/09/2026, the month and year as 09/2026, the run date as dd/mm/yyyy, the flow, the rows', () => {
    expect(replaceTokens('{effective_date}', ctx)).toBe('30/09/2026');
    expect(replaceTokens('Kỳ {month_year}', ctx)).toBe('Kỳ 09/2026');
    expect(replaceTokens('In ngày {run_date}', ctx)).toBe('In ngày 05/11/2026');
    expect(replaceTokens('{flow}: {rows} dòng', ctx)).toBe('Monthly timesheet: 12,345 dòng');
    expect(replaceTokens('Hà Nội, ngày {day} tháng {month} năm {year}', ctx)).toBe('Hà Nội, ngày 05 tháng 11 năm 2026');
  });

  it('replaces a parameter as the text of its value, and every token in a text, and leaves a text with no token alone', () => {
    expect(replaceTokens('{param:dept} - {param:period} - {param:dept}', ctx)).toBe('Sản xuất - 09/2026 - Sản xuất');
    expect(replaceTokens('No tokens here', ctx)).toBe('No tokens here');
    expect(replaceTokens('', ctx)).toBe('');
  });

  it('leaves a token that does not exist as it was, and a brace that opens no token', () => {
    expect(replaceTokens('{nope} and {param:gone}', ctx)).toBe('{nope} and {param:gone}');
    expect(replaceTokens('a { b', ctx)).toBe('a { b');
    expect(replaceTokens('{}', ctx)).toBe('{}');
  });

  it('prints dates in one form whatever the language', () => {
    expect(printedDate('2026-09-30')).toBe('30/09/2026');
    expect(printedDate('2026-01-05T10:00:00Z')).toBe('05/01/2026');
    expect(printedDate('not a date')).toBe('not a date');
  });

  it('lists the tokens of a text as written', () => {
    expect(tokensIn('a {flow} b {param:x} c {nope}')).toEqual(['flow', 'param:x', 'nope']);
  });

  it('finds a token that does not exist and a parameter that the flow does not have, each with its place', () => {
    const print = {
      ...defaultPrintSettings(),
      header: [{ text: 'Ok {flow}', align: 'left' as const, bold: false, size: 'normal' as const }, { text: '{company} {param:period} {param:gone}', align: 'left' as const, bold: false, size: 'normal' as const }],
      dateLine: '{when}',
      signers: [{ title: '{param:boss}', line: 'x', name: '' }],
    };
    expect(printTokenProblems(print, ['period', 'boss'])).toEqual([
      { kind: 'unknown', token: '{company}', where: 'header line 2' },
      { kind: 'param', token: '{param:gone}', where: 'header line 2', key: 'gone' },
      { kind: 'unknown', token: '{when}', where: 'the date line' },
    ]);
    expect(printTokenProblems(defaultPrintSettings(), [])).toEqual([]);
  });

  it('resolves every text of a layout: the header lines, the date line and the signers', () => {
    const print = { ...defaultPrintSettings(), header: [{ text: '{flow}', align: 'center' as const, bold: true, size: 'large' as const }], dateLine: 'Ngày {day}', signers: [{ title: 'Người lập biểu', line: '(Ký) {year}', name: '{param:dept}' }] };
    const r = resolvedTexts(print, ctx);
    expect(r.header[0]).toMatchObject({ text: 'Monthly timesheet', bold: true });
    expect(r.dateLine).toBe('Ngày 05');
    expect(r.signers[0]).toEqual({ title: 'Người lập biểu', line: '(Ký) 2026', name: 'Sản xuất' });
    expect(print.dateLine).toBe('Ngày {day}');
  });
});
