import type { PrintSettings } from './settings';

/** The tokens of a header line or the date line (SPEC 16.1 item 4 and 5). `{param:key}` is the one that has an argument. */
export const PRINT_TOKENS = ['effective_date', 'month_year', 'run_date', 'flow', 'rows', 'day', 'month', 'year'] as const;

const TOKEN = /\{([^{}]*)\}/g;

export interface TokenContext {
  /** ISO dates: `2026-09-30`. */
  effectiveDate: string;
  runDate: string;
  flow: string;
  rows: number;
  /** The values of the parameters as the text that is printed. */
  params: Readonly<Record<string, string>>;
}

/** `2026-09-30` as `30/09/2026`, whatever the language of the app (a printed report has one form, SPEC 16.1). */
export function printedDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** The tokens that a text holds, as written between the braces (`flow`, `param:period`, `nope`). */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1] ?? '');
}

/** The text with its tokens replaced. A token that does not exist is left as it was (the validation names it before a run). */
export function replaceTokens(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN, (whole, name: string) => {
    if (name.startsWith('param:')) return ctx.params[name.slice(6)] ?? whole;
    switch (name) {
      case 'effective_date':
        return printedDate(ctx.effectiveDate);
      case 'month_year':
        return `${ctx.effectiveDate.slice(5, 7)}/${ctx.effectiveDate.slice(0, 4)}`;
      case 'run_date':
        return printedDate(ctx.runDate);
      case 'flow':
        return ctx.flow;
      case 'rows':
        return ctx.rows.toLocaleString('en-US');
      case 'day':
        return ctx.runDate.slice(8, 10);
      case 'month':
        return ctx.runDate.slice(5, 7);
      case 'year':
        return ctx.runDate.slice(0, 4);
      default:
        return whole;
    }
  });
}

export interface TokenProblem {
  /** `unknown` for a token that does not exist, `param` for `{param:key}` with a key that the flow does not have. */
  kind: 'unknown' | 'param';
  token: string;
  /** Where it was found: `header line 2`, `the date line`, `signer 1: the title`. */
  where: string;
  key?: string;
}

/** Every text of the layout that can hold a token, with a name for the place. */
function texts(print: PrintSettings): { where: string; text: string }[] {
  return [
    ...print.header.map((l, i) => ({ where: `header line ${i + 1}`, text: l.text })),
    { where: 'the date line', text: print.dateLine },
    ...print.signers.flatMap((s, i) => [
      { where: `signer ${i + 1}: the title`, text: s.title },
      { where: `signer ${i + 1}: the line under the title`, text: s.line },
      { where: `signer ${i + 1}: the name`, text: s.name },
    ]),
  ];
}

/** The tokens that do not exist and the parameters that the flow does not have, each with its place. */
export function printTokenProblems(print: PrintSettings, parameterKeys: readonly string[]): TokenProblem[] {
  const out: TokenProblem[] = [];
  for (const { where, text } of texts(print)) {
    for (const t of tokensIn(text)) {
      if (t.startsWith('param:')) {
        const key = t.slice(6);
        if (!parameterKeys.includes(key)) out.push({ kind: 'param', token: `{${t}}`, where, key });
      } else if (!(PRINT_TOKENS as readonly string[]).includes(t)) out.push({ kind: 'unknown', token: `{${t}}`, where });
    }
  }
  return out;
}

/** The text of a printed layout with every token replaced, for the writer and the preview. */
export function resolvedTexts(print: PrintSettings, ctx: TokenContext): PrintSettings {
  const r = (t: string): string => replaceTokens(t, ctx);
  return {
    ...print,
    header: print.header.map((l) => ({ ...l, text: r(l.text) })),
    dateLine: r(print.dateLine),
    signers: print.signers.map((s) => ({ title: r(s.title), line: r(s.line), name: r(s.name) })),
  };
}
