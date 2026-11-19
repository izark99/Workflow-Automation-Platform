import { afterEach, describe, expect, it } from 'vitest';
import { resetCatalog } from '../i18n';
import { SCREEN_FILTERS, TEXTS_PAGE_SIZE, checkEdit, filterPairRows, filterTextRows, pageOf, pairChanges, screenOf, textPairRows, textRows, validateTextPair } from './admin-texts-logic';

afterEach(() => resetCatalog());

describe('texts rows', () => {
  it('has a row for every key, with the Vietnamese default or the edit', () => {
    const rows = textRows('vi', [{ locale: 'vi', key: 'nav.flows', value: 'Quy trình', updatedAt: '' }, { locale: 'en', key: 'nav.admin', value: 'Control', updatedAt: '' }]);
    const flows = rows.find((r) => r.key === 'nav.flows')!;
    expect(flows).toMatchObject({ screen: 'nav', defaultText: 'Luồng', current: 'Quy trình', edited: true });
    expect(rows.find((r) => r.key === 'nav.admin')).toMatchObject({ defaultText: 'Quản trị', current: 'Quản trị', edited: false });
    expect(textRows('en', []).find((r) => r.key === 'nav.flows')).toMatchObject({ defaultText: 'Flows', edited: false });
  });
  it('every screen of the rows is one of the filters', () => {
    for (const r of textRows('en', [])) expect(SCREEN_FILTERS, r.key).toContain(r.screen);
  });
  it('filters by key or text, ignoring case, and by screen', () => {
    const rows = textRows('en', []);
    expect(filterTextRows(rows, 'NAV.FLOWS', '').map((r) => r.key)).toContain('nav.flows');
    expect(filterTextRows(rows, 'sign out', '').map((r) => r.key)).toContain('nav.signOut');
    expect(filterTextRows(rows, '', 'theme').every((r) => r.screen === 'theme')).toBe(true);
    expect(filterTextRows(rows, 'sign out', 'theme')).toEqual([]);
    expect(screenOf('flows.createDialog.title')).toBe('flows');
  });
});

describe('checkEdit', () => {
  it('accepts a text that keeps the placeholders', () => {
    expect(checkEdit('About {label}', 'Giới thiệu {label}')).toEqual({ ok: true });
    expect(checkEdit('Plain', 'Other plain')).toEqual({ ok: true });
  });
  it('refuses a missing placeholder and names it', () => {
    expect(checkEdit('About {label}', 'About')).toEqual({ ok: false, error: { key: 'admin.texts.missingPlaceholder', params: { name: '{label}' } } });
  });
  it('refuses a placeholder that the default does not have, an empty text and a broken plural', () => {
    expect(checkEdit('About', 'About {label}')).toMatchObject({ ok: false, error: { key: 'admin.texts.unknownPlaceholder', params: { name: '{label}' } } });
    expect(checkEdit('About', '   ')).toMatchObject({ ok: false, error: { key: 'admin.texts.empty' } });
    expect(checkEdit('{n, plural, one {# row} other {# rows}}', '{n, plural, one {# row}}')).toMatchObject({ ok: false, error: { key: 'admin.texts.notWritten' } });
  });
  it('counts a placeholder inside a plural form', () => {
    expect(checkEdit('{count, plural, one {# row in {table}} other {# rows}}', '{count, plural, one {# row} other {# rows}}')).toMatchObject({ ok: false, error: { params: { name: '{table}' } } });
  });
});

describe('paging', () => {
  it('pages the rows', () => {
    const items = Array.from({ length: TEXTS_PAGE_SIZE * 2 + 5 }, (_, i) => i);
    expect(pageOf(items, 0)).toMatchObject({ from: 1, to: TEXTS_PAGE_SIZE, pages: 3 });
    expect(pageOf(items, 2)).toMatchObject({ from: TEXTS_PAGE_SIZE * 2 + 1, to: items.length });
    expect(pageOf(items, 9).rows).toHaveLength(5);
    expect(pageOf([], 0)).toMatchObject({ from: 0, to: 0, pages: 1 });
  });
});

const edit = (locale: 'en' | 'vi', key: string, value: string) => ({ locale, key, value, updatedAt: '' });

describe('rows with both languages', () => {
  it('has one row for every key with the cells en and vi (default, current, edited)', () => {
    const rows = textPairRows([edit('vi', 'nav.flows', 'Quy trình'), edit('en', 'nav.admin', 'Control')]);
    expect(rows).toHaveLength(textRows('en', []).length);
    expect(rows.find((r) => r.key === 'nav.flows')).toMatchObject({
      screen: 'nav',
      en: { defaultText: 'Flows', current: 'Flows', edited: false },
      vi: { defaultText: 'Luồng', current: 'Quy trình', edited: true },
    });
    expect(rows.find((r) => r.key === 'nav.admin')).toMatchObject({ en: { current: 'Control', edited: true }, vi: { edited: false } });
  });
  it('searches the key and both languages, default or current, and filters by screen and edited only', () => {
    const rows = textPairRows([edit('vi', 'nav.flows', 'Quy trình')]);
    expect(filterPairRows(rows, 'NAV.FLOWS', '', false).map((r) => r.key)).toContain('nav.flows');
    expect(filterPairRows(rows, 'quy trình', '', false).map((r) => r.key)).toEqual(['nav.flows']);
    expect(filterPairRows(rows, 'luồng', '', false).map((r) => r.key)).toContain('nav.flows'); // the default of the edited text
    expect(filterPairRows(rows, 'sign out', '', false).map((r) => r.key)).toContain('nav.signOut'); // English
    expect(filterPairRows(rows, 'đăng xuất', '', false).map((r) => r.key)).toContain('nav.signOut'); // Vietnamese
    expect(filterPairRows(rows, '', 'theme', false).every((r) => r.screen === 'theme')).toBe(true);
    expect(filterPairRows(rows, 'sign out', 'theme', false)).toEqual([]);
    expect(filterPairRows(rows, '', '', true).map((r) => r.key)).toEqual(['nav.flows']);
    expect(filterPairRows(rows, 'sign out', '', true)).toEqual([]);
  });
});

describe('validateTextPair', () => {
  const row = textPairRows([]).find((r) => r.key === 'common.infoTip.about')!; // "About {label}" in both languages
  it('accepts two texts that keep their placeholders', () => {
    expect(validateTextPair(row, { en: 'About {label}!', vi: 'Về {label}' })).toEqual({ ok: true });
  });
  it('names the text that fails: a placeholder missing in Vietnamese only', () => {
    const r = validateTextPair(row, { en: 'About {label}', vi: 'Về nó' });
    expect(r).toEqual({ ok: false, errors: { vi: { key: 'admin.texts.missingPlaceholder', params: { name: '{label}' } } } });
  });
  it('names the text that fails: a placeholder missing in English only', () => {
    const r = validateTextPair(row, { en: 'About', vi: 'Về {label}' });
    expect(r).toEqual({ ok: false, errors: { en: { key: 'admin.texts.missingPlaceholder', params: { name: '{label}' } } } });
  });
  it('returns both errors when both fail, and checks an empty text', () => {
    const r = validateTextPair(row, { en: '', vi: 'x' });
    expect(r).toMatchObject({ ok: false, errors: { en: { key: 'admin.texts.empty' }, vi: { key: 'admin.texts.missingPlaceholder' } } });
  });
  it('checks each text against the placeholders of its own default', () => {
    const plain = textPairRows([]).find((r) => r.key === 'nav.flows')!;
    expect(validateTextPair(plain, { en: 'Flows {x}', vi: 'Luồng' })).toMatchObject({ ok: false, errors: { en: { key: 'admin.texts.unknownPlaceholder' } } });
  });
});

describe('pairChanges', () => {
  const plain = (edits: ReturnType<typeof edit>[]) => textPairRows(edits).find((r) => r.key === 'nav.flows')!;
  it('stores a text that differs from its default and sends nothing for a text equal to it', () => {
    expect(pairChanges(plain([]), { en: 'Pipelines', vi: 'Luồng' })).toEqual({ entries: [{ locale: 'en', key: 'nav.flows', value: 'Pipelines' }], resets: [] });
    expect(pairChanges(plain([]), { en: 'Flows', vi: 'Luồng' })).toEqual({ entries: [], resets: [] });
  });
  it('saves both languages in one result', () => {
    const r = pairChanges(plain([]), { en: 'Pipelines', vi: 'Quy trình' });
    expect(r.entries.map((e) => e.locale)).toEqual(['en', 'vi']);
  });
  it('removes an edit when the text goes back to its default, and does not send an unchanged edit again', () => {
    const row = plain([edit('en', 'nav.flows', 'Pipelines'), edit('vi', 'nav.flows', 'Quy trình')]);
    expect(pairChanges(row, { en: 'Flows', vi: 'Quy trình' })).toEqual({ entries: [], resets: [{ locale: 'en', key: 'nav.flows' }] });
    expect(pairChanges(row, { en: 'Pipelines', vi: 'Quy trình' })).toEqual({ entries: [], resets: [] });
    expect(pairChanges(row, { en: 'Pipelines 2', vi: 'Luồng' })).toEqual({ entries: [{ locale: 'en', key: 'nav.flows', value: 'Pipelines 2' }], resets: [{ locale: 'vi', key: 'nav.flows' }] });
  });
});
