import type { UiText, UiTextLocale } from '../../store/types';
import { KEY_PREFIXES, baseText, catalogKeys, placeholdersOf, validateMessage } from '../i18n';
import type { MessageKey } from '../i18n';

export interface TextRow {
  key: string;
  screen: string;
  /** The built-in text of the language. */
  defaultText: string;
  /** The text that the app shows now: the edit, else the default. */
  current: string;
  edited: boolean;
}

export const TEXTS_PAGE_SIZE = 40;

export const screenOf = (key: string): string => key.split('.')[0] ?? '';

/** One row for every key of the catalog, with its default and current text in a language. */
export function textRows(locale: UiTextLocale, edits: UiText[]): TextRow[] {
  const edited = new Map(edits.filter((e) => e.locale === locale).map((e) => [e.key, e.value]));
  return catalogKeys().map((key) => {
    // Vietnamese has a text for every key; English is the fallback of anything without one.
    const defaultText = baseText(key, locale) ?? baseText(key, 'en') ?? key;
    const value = edited.get(key);
    return { key, screen: screenOf(key), defaultText, current: value ?? defaultText, edited: value !== undefined };
  });
}

/** Rows whose key or text contains the search text (ignoring case), in one screen or in all. */
export function filterTextRows(rows: TextRow[], query: string, screen: string): TextRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (screen === '' || r.screen === screen) && (q === '' || r.key.toLowerCase().includes(q) || r.defaultText.toLowerCase().includes(q) || r.current.toLowerCase().includes(q)));
}

export const SCREEN_FILTERS: readonly string[] = KEY_PREFIXES;

export type EditCheck = { ok: true } | { ok: false; error: { key: MessageKey; params?: Record<string, string> } };

/**
 * An edited text must keep the placeholders of the default (SPEC 11.3). The error names the first placeholder that is
 * missing, or the first that the default does not have.
 */
export function checkEdit(defaultText: string, value: string): EditCheck {
  if (value.trim() === '') return { ok: false, error: { key: 'admin.texts.empty' } };
  const problem = validateMessage(value);
  if (problem) return { ok: false, error: { key: 'admin.texts.notWritten', params: { message: problem } } };
  const want = placeholdersOf(defaultText);
  const have = placeholdersOf(value);
  const missing = want.find((p) => !have.includes(p));
  if (missing) return { ok: false, error: { key: 'admin.texts.missingPlaceholder', params: { name: `{${missing}}` } } };
  const extra = have.find((p) => !want.includes(p));
  if (extra) return { ok: false, error: { key: 'admin.texts.unknownPlaceholder', params: { name: `{${extra}}` } } };
  return { ok: true };
}

export function pageOf<T>(items: T[], page: number): { rows: T[]; from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / TEXTS_PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const from = p * TEXTS_PAGE_SIZE;
  const rows = items.slice(from, from + TEXTS_PAGE_SIZE);
  return { rows, from: items.length === 0 ? 0 : from + 1, to: from + rows.length, pages };
}

// ---- Both languages at once (SPEC 12.3) ----

export const TEXT_LOCALES: readonly UiTextLocale[] = ['en', 'vi'];

/** One language of a key: the built-in text, the text shown now, and whether an edit is stored. */
export interface TextCell {
  defaultText: string;
  current: string;
  edited: boolean;
}

/** One row of the Texts table: a key with its English and Vietnamese cells. */
export interface TextPairRow {
  key: string;
  screen: string;
  en: TextCell;
  vi: TextCell;
}

export function textPairRows(edits: UiText[]): TextPairRow[] {
  const en = textRows('en', edits);
  const vi = textRows('vi', edits);
  const cell = (r: TextRow): TextCell => ({ defaultText: r.defaultText, current: r.current, edited: r.edited });
  return en.map((r, i) => ({ key: r.key, screen: r.screen, en: cell(r), vi: cell(vi[i]!) }));
}

/** Search in the key and in both languages (the default and the current text), a screen, and "Edited only". */
export function filterPairRows(rows: TextPairRow[], query: string, screen: string, editedOnly: boolean): TextPairRow[] {
  const q = query.trim().toLowerCase();
  const has = (c: TextCell): boolean => c.defaultText.toLowerCase().includes(q) || c.current.toLowerCase().includes(q);
  return rows.filter(
    (r) =>
      (screen === '' || r.screen === screen) &&
      (!editedOnly || r.en.edited || r.vi.edited) &&
      (q === '' || r.key.toLowerCase().includes(q) || has(r.en) || has(r.vi)),
  );
}

export type TextError = { key: MessageKey; params?: Record<string, string> };
export type PairCheck = { ok: true } | { ok: false; errors: Partial<Record<UiTextLocale, TextError>> };

/**
 * Each text is checked against the placeholders of its own default. The result holds the error of every text that
 * fails, so the dialog can show it under that text; nothing is saved when either fails.
 */
export function validateTextPair(row: Pick<TextPairRow, 'en' | 'vi'>, value: Record<UiTextLocale, string>): PairCheck {
  const errors: Partial<Record<UiTextLocale, TextError>> = {};
  for (const locale of TEXT_LOCALES) {
    const check = checkEdit(row[locale].defaultText, value[locale]);
    if (!check.ok) errors[locale] = check.error;
  }
  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

export interface PairChanges {
  entries: { locale: UiTextLocale; key: string; value: string }[];
  resets: { locale: UiTextLocale; key: string }[];
}

/**
 * What one Save sends to the server. A text equal to its default is not stored: when an edit exists it is removed
 * (a reset), otherwise nothing is sent. A text equal to the stored edit is not sent again.
 */
export function pairChanges(row: TextPairRow, value: Record<UiTextLocale, string>): PairChanges {
  const out: PairChanges = { entries: [], resets: [] };
  for (const locale of TEXT_LOCALES) {
    const cell = row[locale];
    const next = value[locale];
    if (next === cell.defaultText) {
      if (cell.edited) out.resets.push({ locale, key: row.key });
    } else if (next !== cell.current || !cell.edited) {
      out.entries.push({ locale, key: row.key, value: next });
    }
  }
  return out;
}
