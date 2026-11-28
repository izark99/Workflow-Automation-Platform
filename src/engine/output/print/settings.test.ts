import { describe, expect, it } from 'vitest';
import { defaultPrintSettings, DEFAULT_SIGNER_LINE, MAX_HEADER_LINES, MAX_LINE_LENGTH, MAX_SIGNERS, newHeaderLine, newSigner, parsePrintSettings, printIsOn, PrintSettingsError } from './settings';

describe('the print settings', () => {
  it('turning the switch on gives A4, portrait, normal margins, fit to width, a repeated header and page numbers, with no lines and no signers', () => {
    expect(defaultPrintSettings()).toEqual({ enabled: true, paper: 'A4', orientation: 'portrait', margins: 'normal', fitWidth: true, repeatHeader: true, pageNumbers: true, header: [], dateLine: '', signers: [] });
    expect(parsePrintSettings({})).toEqual(defaultPrintSettings());
  });

  it('the first line that is added is centred, bold and large; the others are plain, and a signer has the usual line under the title', () => {
    expect(newHeaderLine(true)).toEqual({ text: '', align: 'center', bold: true, size: 'large' });
    expect(newHeaderLine(false)).toEqual({ text: '', align: 'left', bold: false, size: 'normal' });
    expect(newSigner().line).toBe(DEFAULT_SIGNER_LINE);
    expect(DEFAULT_SIGNER_LINE).toBe('(Ký, ghi rõ họ tên)');
  });

  it('reads a full layout', () => {
    const p = parsePrintSettings({
      enabled: true, paper: 'A3', orientation: 'landscape', margins: 'narrow', fitWidth: false, repeatHeader: false, pageNumbers: false,
      header: [{ text: 'CÔNG TY DƯỢC', align: 'center', bold: true, size: 'xlarge' }, { text: 'Kỳ {month_year}' }],
      dateLine: 'Hà Nội, ngày {day} tháng {month} năm {year}',
      signers: [{ title: 'Người lập biểu', name: 'Lan' }, { title: 'Kế toán trưởng', line: '(Ký)' }],
    });
    expect(p).toMatchObject({ paper: 'A3', orientation: 'landscape', margins: 'narrow', fitWidth: false, repeatHeader: false, pageNumbers: false });
    expect(p.header[1]).toEqual({ text: 'Kỳ {month_year}', align: 'left', bold: false, size: 'normal' });
    expect(p.signers[0]).toEqual({ title: 'Người lập biểu', line: DEFAULT_SIGNER_LINE, name: 'Lan' });
    expect(p.signers[1]?.line).toBe('(Ký)');
  });

  it('keeps the settings when the switch is off, and printIsOn follows the switch', () => {
    expect(parsePrintSettings({ enabled: false, paper: 'Letter' })).toMatchObject({ enabled: false, paper: 'Letter' });
    expect(printIsOn({ enabled: false })).toBe(false);
    expect(printIsOn({ paper: 'A4' })).toBe(true);
    expect(printIsOn(undefined)).toBe(false);
  });

  it('says which field is wrong and what to do: an unknown paper, orientation, margins, alignment, size, and a switch that is not true or false', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ paper: 'B5' }, /paper is "B5"; use one of A4, A3, Letter/],
      [{ orientation: 'tilted' }, /orientation is "tilted"/],
      [{ margins: 'huge' }, /margins is "huge"/],
      [{ header: [{ text: 'x', align: 'middle' }] }, /Header line 1: the alignment is "middle"/],
      [{ header: [{ text: 'x', size: 'huge' }] }, /Header line 1: the size/],
      [{ fitWidth: 'yes' }, /fit all columns on one page wide" must be true or false/],
      [{ header: 'a line' }, /header lines must be a list/],
      [{ signers: [5] }, /Signer 1 must be an object/],
    ];
    for (const [raw, message] of cases) expect(() => parsePrintSettings(raw), JSON.stringify(raw)).toThrow(message);
    expect(() => parsePrintSettings('A4')).toThrow(PrintSettingsError);
  });

  it('allows 6 header lines and 5 signers, and refuses one more, and says how many to remove', () => {
    const lines = (n: number) => Array.from({ length: n }, () => ({ text: 'x' }));
    const signers = (n: number) => Array.from({ length: n }, () => ({ title: 'T' }));
    expect(parsePrintSettings({ header: lines(MAX_HEADER_LINES) }).header).toHaveLength(6);
    expect(() => parsePrintSettings({ header: lines(7) })).toThrow(/7 header lines; at most 6. Remove 1/);
    expect(parsePrintSettings({ signers: signers(MAX_SIGNERS) }).signers).toHaveLength(5);
    expect(() => parsePrintSettings({ signers: signers(6) })).toThrow(/6 signers; at most 5. Remove 1/);
  });

  it('allows a line of 200 characters and refuses 201, in a header line, the date line and a signer', () => {
    const ok = 'a'.repeat(MAX_LINE_LENGTH);
    const long = 'a'.repeat(MAX_LINE_LENGTH + 1);
    expect(parsePrintSettings({ header: [{ text: ok }] }).header[0]?.text).toHaveLength(200);
    expect(() => parsePrintSettings({ header: [{ text: long }] })).toThrow(/Header line 1: the text has 201 characters; the longest is 200/);
    expect(() => parsePrintSettings({ dateLine: long, signers: [{ title: 'T' }] })).toThrow(/The date line has 201 characters/);
    expect(() => parsePrintSettings({ signers: [{ title: long }] })).toThrow(/Signer 1: the title has 201 characters/);
  });

  it('refuses a date line without a signer, and accepts an empty date line without one', () => {
    expect(() => parsePrintSettings({ dateLine: 'Hà Nội, {day}' })).toThrow(/date line but no signer/);
    expect(parsePrintSettings({ dateLine: '   ' }).signers).toEqual([]);
  });
});
