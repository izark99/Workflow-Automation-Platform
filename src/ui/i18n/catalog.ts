import { formatMessage, placeholdersOf } from './format';
import type { MessageParams } from './format';
import { en } from './messages/en';
import type { MessageKey } from './messages/en';
import { vi } from './messages/vi';

export type { MessageKey } from './messages/en';
export type { MessageParams } from './format';

/** The screen a key belongs to. The Texts tab filters by it (T4.7g). */
export const KEY_PREFIXES = ['app', 'common', 'nav', 'signIn', 'theme', 'language', 'flows', 'builder', 'run', 'versions', 'refTables', 'admin', 'errors', 'engine', 'dev'] as const;

export type Locale = 'en' | 'vi' | 'pseudo';
export const PSEUDO_OPEN = '⟦';
export const PSEUDO_CLOSE = '⟧';

type Table = Partial<Record<string, string>>;

const base: Record<'en' | 'vi', Table> = { en, vi };
let locale: Locale = 'en';
let overrides: Record<string, Table> = {};
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version++;
  for (const l of listeners) l();
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'vi' ? 'vi' : 'en';
  changed();
}

/**
 * Edited texts by locale (`{ vi: { 'run.title': '…' } }`). An override whose placeholders differ from the default is
 * dropped: the default may have changed since it was saved.
 */
export function setOverrides(next: Record<string, Table>): void {
  const kept: Record<string, Table> = {};
  for (const [loc, table] of Object.entries(next)) {
    for (const [key, value] of Object.entries(table)) {
      const fallback = base[loc as 'en' | 'vi']?.[key] ?? base.en[key];
      if (value === undefined || fallback === undefined) continue;
      if (placeholdersOf(value).join() !== placeholdersOf(fallback).join()) continue;
      (kept[loc] ??= {})[key] = value;
    }
  }
  overrides = kept;
  changed();
}

/** The text of a key in a locale, with the fallbacks: override, locale, override of English, English, the key itself. */
export function lookup(key: string, loc: 'en' | 'vi'): string {
  return overrides[loc]?.[key] ?? base[loc][key] ?? overrides.en?.[key] ?? base.en[key] ?? key;
}

/** The built-in text of a key in a language, without any edit; undefined when the language has none. */
export const baseText = (key: string, loc: 'en' | 'vi'): string | undefined => base[loc][key];

/** Every key of the catalog, in the order of the default texts. */
export const catalogKeys = (): string[] => Object.keys(en);

/** True when the catalog has a text for this key. */
export const hasKey = (key: string): key is MessageKey => key in en;

export function translate(key: MessageKey, params?: MessageParams, loc: Locale = locale): string {
  if (loc === 'pseudo') {
    // A parameter that is itself a pseudo text loses its markers, so a message is wrapped once, not in nested pairs.
    const plain = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v.split(PSEUDO_OPEN).join('').split(PSEUDO_CLOSE).join('') : v]));
    return `${PSEUDO_OPEN}${formatMessage(lookup(key, 'en'), plain, 'en')}${PSEUDO_CLOSE}`;
  }
  return formatMessage(lookup(key, loc), params, loc);
}

/** `t()` in the current locale. Prefer `useT()` in components, so they render again when the language changes. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(key, params);
}

/** A text as data: logic modules return it, the component turns it into text with `t(m.key, m.params)`. */
export interface Message {
  key: MessageKey;
  params?: MessageParams;
}

export function translateMessage(m: Message, loc: Locale = locale): string {
  return translate(m.key, m.params, loc);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the locale or the overrides change. */
export function snapshot(): number {
  return version;
}

/** Test helper: back to English with no overrides. */
export function resetCatalog(): void {
  locale = 'en';
  overrides = {};
  changed();
}

export const LOCALE_STORAGE_KEY = 'dfw.locale';

/** Keeps the choice of the user in the browser. Blocked storage only means the choice is not remembered. */
export function saveLocale(storage: Pick<Storage, 'setItem'> | undefined, loc: 'en' | 'vi'): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, loc);
  } catch {
    // The language still applies to this page.
  }
}

/**
 * The locale kept in the browser. `pseudo` is for the UI rule only: it is accepted when the build has the development
 * routes (`allowPseudo`) and is never offered in the language switch.
 */
export function readLocale(storage: Pick<Storage, 'getItem'> | undefined, allowPseudo: boolean): Locale {
  try {
    const raw = storage?.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'vi') return 'vi';
    if (raw === 'pseudo' && allowPseudo) return 'pseudo';
  } catch {
    // Storage blocked: English.
  }
  return 'en';
}
