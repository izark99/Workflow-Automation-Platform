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
