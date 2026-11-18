import { afterEach, describe, expect, it } from 'vitest';
import { resetCatalog } from '../i18n';
import { SCREEN_FILTERS, TEXTS_PAGE_SIZE, checkEdit, filterTextRows, pageOf, screenOf, textRows } from './admin-texts-logic';

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
