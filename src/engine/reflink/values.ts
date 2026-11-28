// The values of a linked reference table (SPEC 16.2 items 2 and 3). No React, no Supabase.
import { dayAfter } from '../versions';
import type { Cell } from '../types';

/** The text of a cell as a value of a link: numbers and booleans as they are written, dates as ISO text. Blank is null. */
function textOf(cell: Cell): string | null {
  if (cell === null || cell === undefined) return null;
  const s = typeof cell === 'string' ? cell : String(cell);
  const t = s.trim();
  return t === '' ? null : t;
}

/**
 * The distinct values of a column (SPEC 16.2 item 2): text trimmed, blank values left out, and case and accents count (`a` and `A`
 * are two values, `e` and `é` are two). The order is that of the first time each value appears.
 */
export function distinctValues(cells: readonly Cell[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cell of cells) {
    const v = textOf(cell);
    if (v === null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** The values that B does not hold yet, in the order they have in `values` (SPEC 16.2 item 3). `keys` come from every version of B. */
export function newValues(values: readonly string[], keys: ReadonlySet<string>): string[] {
  return values.filter((v) => !keys.has(v));
}

/** The keys that a table holds in a column across all its versions, draft or published: trimmed text, blank left out. */
export function keysOf(versions: readonly { columns: readonly { name: string }[]; rows: readonly (readonly Cell[])[] }[], keyColumn: string): Set<string> {
  const keys = new Set<string>();
  for (const v of versions) {
    const i = v.columns.findIndex((c) => c.name === keyColumn);
    if (i < 0) continue;
    for (const row of v.rows) {
      const k = textOf(row[i] ?? null);
      if (k !== null) keys.add(k);
    }
  }
  return keys;
}

export interface LinkVersion {
  versionNo: number;
  validFrom: string;
  validTo: string | null;
  status: 'draft' | 'published';
}

/**
 * The version of A that gives the values when a link is made (SPEC 16.2 item 2): the published version in effect on `today`; when no
 * version covers that day, the last published one (the latest start). Null when A has no published version.
 */
export function versionInEffect<T extends LinkVersion>(versions: readonly T[], today: string): T | null {
  const published = versions.filter((v) => v.status === 'published');
  if (published.length === 0) return null;
  const covering = published.find((v) => v.validFrom <= today && (v.validTo === null || today <= v.validTo));
  if (covering) return covering;
  return published.reduce((best, v) => (v.validFrom > best.validFrom || (v.validFrom === best.validFrom && v.versionNo > best.versionNo) ? v : best));
}

/**
 * The start of the draft of B that a publish of A makes (SPEC 16.2 item 3). `aStart` is the day the new version of A starts and
 * `last` the latest published version of B. The draft starts on `aStart` when that is after the start of `last`; otherwise on the day
 * after the end of `last` (the day after its start when it has no end); today when B has no published version.
 */
export function draftStart(aStart: string, last: { validFrom: string; validTo: string | null } | null, today: string): string {
  if (last === null) return today;
  if (aStart > last.validFrom) return aStart;
  return dayAfter(last.validTo ?? last.validFrom);
}

/** What a notice shows (SPEC 16.2 item 4): the first values, and how many more there are. */
export function noticeValues(values: readonly string[], show = 3): { first: string[]; more: number } {
  return { first: values.slice(0, show), more: Math.max(0, values.length - show) };
}

/** The keys of B that A does not hold any more: shown as "Not in A any more" (SPEC 16.2 item 3). Nothing is deleted. */
export function notInSource(keys: readonly string[], current: ReadonlySet<string>): string[] {
  return keys.filter((k) => !current.has(k));
}
