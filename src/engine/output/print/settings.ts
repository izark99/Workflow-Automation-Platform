// The print layout of an Output step (SPEC 16.1): the settings, their defaults and their validation. No React, no ExcelJS.

export const PAPERS = ['A4', 'A3', 'Letter'] as const;
export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export const MARGINS = ['normal', 'narrow', 'wide'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export const SIZES = ['normal', 'large', 'xlarge'] as const;

export const MAX_HEADER_LINES = 6;
export const MAX_LINE_LENGTH = 200;
export const MAX_SIGNERS = 5;
/** The line under the title of a signer, when none is given (Vietnamese reports, SPEC 16.1 item 5). */
export const DEFAULT_SIGNER_LINE = '(Ký, ghi rõ họ tên)';

export type Paper = (typeof PAPERS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Margins = (typeof MARGINS)[number];
export type Align = (typeof ALIGNS)[number];
export type LineSize = (typeof SIZES)[number];

export interface PrintLine {
  text: string;
  align: Align;
  bold: boolean;
  size: LineSize;
}

export interface PrintSigner {
  /** Bold, above the space to sign ("Người lập biểu"). */
  title: string;
  /** In italics under the title. */
  line: string;
  /** Under the space to sign. Optional. */
  name: string;
}

export interface PrintSettings {
  /** The switch. With it off the sheet is written as before; the rest of the settings are kept. */
  enabled: boolean;
  paper: Paper;
  orientation: Orientation;
  margins: Margins;
  fitWidth: boolean;
  repeatHeader: boolean;
  pageNumbers: boolean;
  header: PrintLine[];
  /** The line on the right above the signers, with the tokens `{day}`, `{month}` and `{year}`. Optional. */
  dateLine: string;
  signers: PrintSigner[];
}

/** What turning the switch on gives (DESIGN): A4, portrait, normal margins, fit to width, repeat the header, page numbers. */
export const defaultPrintSettings = (): PrintSettings => ({
  enabled: true,
  paper: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  fitWidth: true,
  repeatHeader: true,
  pageNumbers: true,
  header: [],
  dateLine: '',
  signers: [],
});

/** The first line that is added is centred, bold and large (DESIGN). */
export const newHeaderLine = (first: boolean): PrintLine => ({ text: '', align: first ? 'center' : 'left', bold: first, size: first ? 'large' : 'normal' });

export const newSigner = (): PrintSigner => ({ title: '', line: DEFAULT_SIGNER_LINE, name: '' });

export class PrintSettingsError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function choice<T extends string>(value: unknown, list: readonly T[], fallback: T, what: string): T {
  const v = value ?? fallback;
  if (!(list as readonly unknown[]).includes(v)) throw new PrintSettingsError(`${what} is ${JSON.stringify(v)}; use one of ${list.join(', ')}.`);
  return v as T;
}

function flag(value: unknown, fallback: boolean, what: string): boolean {
  const v = value ?? fallback;
  if (typeof v !== 'boolean') throw new PrintSettingsError(`${what} must be true or false.`);
  return v;
}

function text(value: unknown, what: string, max = MAX_LINE_LENGTH): string {
  const v = value ?? '';
  if (typeof v !== 'string') throw new PrintSettingsError(`${what} must be a text.`);
  if (v.length > max) throw new PrintSettingsError(`${what} has ${v.length} characters; the longest is ${max}. Shorten it.`);
  return v;
}

/**
 * Reads the `print` setting of an Output step. Throws `PrintSettingsError` with a message that names the field and says what to
 * do. The tokens are checked apart (`printTokenProblems`), because the parameters are known only to the whole flow.
 */
export function parsePrintSettings(raw: unknown): PrintSettings {
  if (!isRecord(raw)) throw new PrintSettingsError('The print layout must be an object.');
  const d = defaultPrintSettings();
  const headerRaw = raw.header ?? [];
  if (!Array.isArray(headerRaw)) throw new PrintSettingsError('The header lines must be a list.');
  if (headerRaw.length > MAX_HEADER_LINES) throw new PrintSettingsError(`The print layout has ${headerRaw.length} header lines; at most ${MAX_HEADER_LINES}. Remove ${headerRaw.length - MAX_HEADER_LINES}.`);
  const header = headerRaw.map((l, i): PrintLine => {
    if (!isRecord(l)) throw new PrintSettingsError(`Header line ${i + 1} must be an object.`);
    const where = `Header line ${i + 1}`;
    return {
      text: text(l.text, `${where}: the text`),
      align: choice(l.align, ALIGNS, 'left', `${where}: the alignment`),
      bold: flag(l.bold, false, `${where}: bold`),
      size: choice(l.size, SIZES, 'normal', `${where}: the size`),
    };
  });
  const signersRaw = raw.signers ?? [];
  if (!Array.isArray(signersRaw)) throw new PrintSettingsError('The signers must be a list.');
  if (signersRaw.length > MAX_SIGNERS) throw new PrintSettingsError(`The print layout has ${signersRaw.length} signers; at most ${MAX_SIGNERS}. Remove ${signersRaw.length - MAX_SIGNERS}.`);
  const signers = signersRaw.map((s, i): PrintSigner => {
    if (!isRecord(s)) throw new PrintSettingsError(`Signer ${i + 1} must be an object.`);
    const where = `Signer ${i + 1}`;
    return { title: text(s.title, `${where}: the title`), line: text(s.line ?? DEFAULT_SIGNER_LINE, `${where}: the line under the title`), name: text(s.name, `${where}: the name`) };
  });
  const dateLine = text(raw.dateLine, 'The date line');
  if (dateLine.trim() !== '' && signers.length === 0) throw new PrintSettingsError('The print layout has a date line but no signer. Add a signer, or empty the date line.');
  return {
    enabled: flag(raw.enabled, d.enabled, 'The switch "enabled"'),
    paper: choice(raw.paper, PAPERS, d.paper, 'The paper'),
    orientation: choice(raw.orientation, ORIENTATIONS, d.orientation, 'The orientation'),
    margins: choice(raw.margins, MARGINS, d.margins, 'The margins'),
    fitWidth: flag(raw.fitWidth, d.fitWidth, '"fit all columns on one page wide"'),
    repeatHeader: flag(raw.repeatHeader, d.repeatHeader, '"repeat the header row"'),
    pageNumbers: flag(raw.pageNumbers, d.pageNumbers, '"page numbers"'),
    header,
    dateLine,
    signers,
  };
}

/** Is a print layout on for this value of the `print` setting? */
export const printIsOn = (raw: unknown): boolean => isRecord(raw) && raw.enabled !== false;
