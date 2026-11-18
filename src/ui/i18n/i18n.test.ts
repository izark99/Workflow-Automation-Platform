import { afterEach, describe, expect, it } from 'vitest';
import { KEY_PREFIXES, PSEUDO_CLOSE, PSEUDO_OPEN, lookup, resetCatalog, setLocale, setOverrides, t, translate } from './catalog';
import { formatMessage, placeholdersOf, validateMessage } from './format';
import { en } from './messages/en';
import { vi } from './messages/vi';

afterEach(() => resetCatalog());

describe('formatMessage', () => {
  it('fills named placeholders and leaves a missing one visible', () => {
    expect(formatMessage('Hello {name}, {n} files', { name: 'Lan', n: 3 }, 'en')).toBe('Hello Lan, 3 files');
    expect(formatMessage('Hello {name}', {}, 'en')).toBe('Hello {name}');
    expect(formatMessage('Plain text', undefined, 'en')).toBe('Plain text');
  });
  it('chooses the plural branch of the locale and writes # as the count', () => {
    const m = '{count, plural, one {# row} other {# rows}}';
    expect(formatMessage(m, { count: 1 }, 'en')).toBe('1 row');
    expect(formatMessage(m, { count: 0 }, 'en')).toBe('0 rows');
    expect(formatMessage(m, { count: 5 }, 'en')).toBe('5 rows');
  });
  it('Vietnamese has only the other category', () => {
    const m = '{count, plural, one {# row} other {# dòng}}';
    expect(formatMessage(m, { count: 1 }, 'vi')).toBe('1 dòng');
  });
  it('allows placeholders inside a plural branch and a missing count stays visible', () => {
    const m = '{count, plural, one {# row in {table}} other {# rows in {table}}}';
    expect(formatMessage(m, { count: 2, table: 'OT limits' }, 'en')).toBe('2 rows in OT limits');
    expect(formatMessage(m, { table: 'T' }, 'en')).toBe('{count}');
  });
  it('returns a malformed message as it is instead of throwing', () => {
    expect(formatMessage('Broken {name', { name: 'x' }, 'en')).toBe('Broken {name');
    expect(formatMessage('Stray } brace', undefined, 'en')).toBe('Stray } brace');
  });
});

describe('placeholdersOf and validateMessage', () => {
  it('lists plain, plural and nested names, sorted and unique', () => {
    expect(placeholdersOf('{b} and {a} and {b}')).toEqual(['a', 'b']);
    expect(placeholdersOf('{count, plural, one {# row in {table}} other {# rows}}')).toEqual(['count', 'table']);
    expect(placeholdersOf('no placeholders')).toEqual([]);
  });
  it('requires the other branch and known categories', () => {
    expect(validateMessage('{n, plural, one {# row}}')).toMatch(/other/);
    expect(validateMessage('{n, plural, several {# rows} other {# rows}}')).toMatch(/not a plural category/);
    expect(validateMessage('{n, select, a {x} other {y}}')).toMatch(/not a placeholder or a plural/);
    expect(validateMessage('{n, plural, one {# row} other {# rows}}')).toBeNull();
    expect(validateMessage('Plain')).toBeNull();
  });
});

describe('catalog lookup', () => {
  it('has the default texts in English', () => {
    expect(t('app.brand')).toBe('Data Flow');
    expect(t('common.infoTip.about', { label: 'Run flow' })).toBe('About Run flow');
  });
  it('falls back: override of the locale, locale, override of English, English, the key', () => {
    expect(lookup('app.brand', 'vi')).toBe('Data Flow'); // no Vietnamese value yet: English
    setOverrides({ en: { 'app.brand': 'Flows' } });
    expect(lookup('app.brand', 'vi')).toBe('Flows'); // override of English beats base English
    setOverrides({ en: { 'app.brand': 'Flows' }, vi: { 'app.brand': 'Luồng' } });
    expect(lookup('app.brand', 'vi')).toBe('Luồng');
    expect(lookup('app.brand', 'en')).toBe('Flows');
    expect(lookup('no.such.key', 'en')).toBe('no.such.key');
  });
  it('drops an override whose placeholders differ from the default', () => {
    setOverrides({ en: { 'common.infoTip.about': 'About', 'app.brand': 'Flows' } });
    expect(t('common.infoTip.about', { label: 'x' })).toBe('About x');
    expect(t('app.brand')).toBe('Flows');
  });
  it('the pseudo-locale wraps every text in markers', () => {
    setLocale('pseudo');
    expect(t('app.brand')).toBe(`${PSEUDO_OPEN}Data Flow${PSEUDO_CLOSE}`);
    expect(t('common.infoTip.about', { label: 'Run' })).toBe(`${PSEUDO_OPEN}About Run${PSEUDO_CLOSE}`);
  });
  it('the pseudo-locale wraps a message once, also when a parameter is a pseudo text', () => {
    setLocale('pseudo');
    const inner = t('app.brand');
    expect(t('common.infoTip.about', { label: inner })).toBe(`${PSEUDO_OPEN}About Data Flow${PSEUDO_CLOSE}`);
  });
  it('translate takes the locale of the call', () => {
    setOverrides({ vi: { 'app.brand': 'Luồng' } });
    expect(translate('app.brand', undefined, 'vi')).toBe('Luồng');
    expect(translate('app.brand', undefined, 'en')).toBe('Data Flow');
  });
});

describe('catalog content', () => {
  it('every key starts with a known screen prefix', () => {
    for (const key of Object.keys(en)) expect(KEY_PREFIXES, key).toContain(key.split('.')[0]);
  });
  it('every message of every catalog is well formed, and vi keeps the placeholders of en', () => {
    for (const [key, value] of Object.entries(en)) expect(validateMessage(value), key).toBeNull();
    for (const [key, value] of Object.entries(vi)) {
      expect(validateMessage(value), key).toBeNull();
      expect(placeholdersOf(value), key).toEqual(placeholdersOf((en as Record<string, string>)[key]!));
    }
  });
});

import { readLocale } from './catalog';

describe('readLocale', () => {
  const store = (v: string | null) => ({ getItem: () => v });
  it('accepts vi, accepts pseudo only when allowed, and falls back to English', () => {
    expect(readLocale(store('vi'), false)).toBe('vi');
    expect(readLocale(store('pseudo'), true)).toBe('pseudo');
    expect(readLocale(store('pseudo'), false)).toBe('en');
    expect(readLocale(store('fr'), true)).toBe('en');
    expect(readLocale(undefined, true)).toBe('en');
    expect(readLocale({ getItem: () => { throw new Error('blocked'); } }, true)).toBe('en');
  });
});
