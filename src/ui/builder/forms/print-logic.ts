// The pure part of the "Print layout" group of the Output form (SPEC 16.1, DESIGN "Print layout"). No React.
import { MAX_HEADER_LINES, MAX_LINE_LENGTH, MAX_SIGNERS, defaultPrintSettings, newHeaderLine, newSigner, parsePrintSettings } from '../../../engine/output/print/settings';
import type { PrintLine, PrintSettings, PrintSigner } from '../../../engine/output/print/settings';
import { PRINT_TOKENS, tokensIn } from '../../../engine/output/print/tokens';
import { translate } from '../../i18n';

export { MAX_HEADER_LINES, MAX_LINE_LENGTH, MAX_SIGNERS };

/** The layout of the step as the form holds it: null when the step never had one. A layout that is switched off is kept. */
export type PrintValue = PrintSettings | null;

/** The form value of the stored `print` setting. A stored layout that does not parse is shown as none (the engine names the fault on a run). */
export function printFromSettings(raw: unknown): PrintValue {
  if (raw === undefined) return null;
  try {
    return parsePrintSettings(raw);
  } catch {
    return null;
  }
}

/** The switch: on starts from the defaults, or from the settings that were kept; off keeps the settings. */
export function switchPrint(value: PrintValue, on: boolean): PrintValue {
  if (on) return { ...(value ?? defaultPrintSettings()), enabled: true };
  return value ? { ...value, enabled: false } : null;
}

/** The first line added is centred, bold and large; the next ones are plain. */
export function addHeaderLine(p: PrintSettings): PrintSettings {
  if (p.header.length >= MAX_HEADER_LINES) return p;
  return { ...p, header: [...p.header, newHeaderLine(p.header.length === 0)] };
}
export function addSigner(p: PrintSettings): PrintSettings {
  if (p.signers.length >= MAX_SIGNERS) return p;
  return { ...p, signers: [...p.signers, newSigner()] };
}
export const patchLine = (p: PrintSettings, i: number, change: Partial<PrintLine>): PrintSettings => ({ ...p, header: p.header.map((l, j) => (j === i ? { ...l, ...change } : l)) });
export const patchSigner = (p: PrintSettings, i: number, change: Partial<PrintSigner>): PrintSettings => ({ ...p, signers: p.signers.map((s, j) => (j === i ? { ...s, ...change } : s)) });

export interface SignerErrors {
  title?: string;
  line?: string;
  name?: string;
}
export interface PrintErrors {
  header: (string | undefined)[];
  dateLine?: string;
  signers: SignerErrors[];
}

/** The tokens that can be typed, for the info button. */
export const tokenList = (): string => [...PRINT_TOKENS.map((t) => `{${t}}`), '{param:key}'].join('  ');

/** What is wrong with one text: too long, a token that does not exist, a parameter that the flow does not have. */
export function textError(text: string, parameterKeys: readonly string[]): string | undefined {
  if (text.length > MAX_LINE_LENGTH) return translate('builder.print.error.tooLong', { n: text.length, max: MAX_LINE_LENGTH });
  for (const token of tokensIn(text)) {
    if (token.startsWith('param:')) {
      const key = token.slice(6);
      if (!parameterKeys.includes(key)) return translate('builder.print.error.param', { token: `{${token}}`, key });
    } else if (!(PRINT_TOKENS as readonly string[]).includes(token)) {
      return translate('builder.print.error.token', { token: `{${token}}`, tokens: tokenList() });
    }
  }
  return undefined;
}

export function printErrors(p: PrintSettings, parameterKeys: readonly string[]): PrintErrors {
  return {
    header: p.header.map((l) => textError(l.text, parameterKeys)),
    dateLine: textError(p.dateLine, parameterKeys) ?? (p.dateLine.trim() !== '' && p.signers.length === 0 ? translate('builder.print.error.dateNoSigner') : undefined),
    signers: p.signers.map((s) => ({ title: textError(s.title, parameterKeys), line: textError(s.line, parameterKeys), name: textError(s.name, parameterKeys) })),
  };
}

export function hasPrintErrors(e: PrintErrors): boolean {
  return e.header.some(Boolean) || Boolean(e.dateLine) || e.signers.some((s) => s.title || s.line || s.name);
}
