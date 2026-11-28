import { describe, expect, it } from 'vitest';
import { defaultPrintSettings } from '../../../engine/output/print/settings';
import { outputFromSettings, outputToSettings } from './output-logic';
import { addHeaderLine, addSigner, hasPrintErrors, patchLine, printErrors, printFromSettings, switchPrint, textError, MAX_HEADER_LINES, MAX_SIGNERS } from './print-logic';

describe('the switch', () => {
  it('turns on with the defaults, and keeps the settings when it is turned off and on again', () => {
    const on = switchPrint(null, true)!;
    expect(on).toEqual(defaultPrintSettings());
    const changed = { ...on, paper: 'A3' as const };
    const off = switchPrint(changed, false)!;
    expect(off.enabled).toBe(false);
    expect(off.paper).toBe('A3');
    expect(switchPrint(off, true)).toEqual(changed);
    expect(switchPrint(null, false)).toBeNull();
  });
});

describe('the lines and the signers', () => {
  it('the first line is centred, bold and large; the next ones are plain; at most 6 lines and 5 signers', () => {
    let p = defaultPrintSettings();
    p = addHeaderLine(p);
    expect(p.header[0]).toEqual({ text: '', align: 'center', bold: true, size: 'large' });
    p = addHeaderLine(p);
    expect(p.header[1]).toEqual({ text: '', align: 'left', bold: false, size: 'normal' });
    for (let i = 0; i < 10; i++) p = addHeaderLine(p);
    expect(p.header).toHaveLength(MAX_HEADER_LINES);
    for (let i = 0; i < 10; i++) p = addSigner(p);
    expect(p.signers).toHaveLength(MAX_SIGNERS);
    expect(p.signers[0]!.line).toBe('(Ký, ghi rõ họ tên)');
    expect(patchLine(p, 1, { bold: true }).header[1]!.bold).toBe(true);
  });
});

describe('the errors', () => {
  it('names a token that does not exist, a parameter that the flow lacks, and a text that is too long', () => {
    expect(textError('Month {month_year}', [])).toBeUndefined();
    expect(textError('{param:period}', ['period'])).toBeUndefined();
    expect(textError('{nope}', [])).toContain('{nope} is not a token');
    expect(textError('{param:x}', ['period'])).toContain('"x"');
    expect(textError('a'.repeat(201), [])).toContain('201 characters');
  });
  it('a date line without a signer is an error under the date line', () => {
    const p = { ...defaultPrintSettings(), dateLine: 'Ngày {day}' };
    const e = printErrors(p, []);
    expect(e.dateLine).toContain('needs a signer');
    expect(hasPrintErrors(e)).toBe(true);
    expect(hasPrintErrors(printErrors(addSigner(p), []))).toBe(false);
  });
});

describe('the settings of the Output step', () => {
  it('a step without a layout has none; a layout is stored in the step and read back; one that is off is kept', () => {
    expect(outputFromSettings({ file: 'R', format: 'xlsx', sheet: 'S' }).print).toBeNull();
    const v = outputFromSettings({ file: 'R', format: 'xlsx', sheet: 'S' });
    const stored = outputToSettings({ ...v, print: switchPrint(null, true) }, {}).settings!;
    expect((stored.print as { enabled: boolean }).enabled).toBe(true);
    const back = outputFromSettings(stored);
    expect(back.print).toEqual(defaultPrintSettings());
    const off = outputToSettings({ ...back, print: switchPrint(back.print, false) }, stored).settings!;
    expect((off.print as { enabled: boolean }).enabled).toBe(false);
    expect(outputToSettings({ ...back, print: null }, stored).settings!.print).toBeUndefined();
  });
  it('a stored layout that does not parse is read as none', () => {
    expect(printFromSettings({ paper: 'B5' })).toBeNull();
  });
});
