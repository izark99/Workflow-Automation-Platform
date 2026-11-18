import { describe, expect, it } from 'vitest';
import { addColumn, parseFill, pivotFromSettings, pivotMissing, pivotToSettings, unpivotFromSettings, unpivotMissing, unpivotToSettings } from './reshape-logic';

describe('Unpivot', () => {
  const saved = { keep: ['id'], unpivot: ['mon', 'tue'], nameColumn: 'day', valueColumn: 'hours', skipBlank: true };
  it('reads and writes the same settings, writing skipBlank only when on', () => {
    expect(unpivotToSettings(unpivotFromSettings(saved), {})).toEqual(saved);
    const off = unpivotToSettings({ ...unpivotFromSettings(saved), skipBlank: false }, saved);
    expect('skipBlank' in off).toBe(false);
    expect(unpivotToSettings({ ...unpivotFromSettings(saved), nameColumn: ' day ' }, {}).nameColumn).toBe('day');
  });
  it('a column is in one list only; the refusal says where it is and what to do', () => {
    expect(addColumn(['id'], [], 'the unpivot list', ' mon ')).toEqual({ list: ['id', 'mon'] });
    expect(addColumn(['id'], [], 'x', 'id')).toEqual({ list: ['id'] });
    expect(addColumn(['id'], [], 'x', '  ')).toEqual({ list: ['id'] });
    const r = addColumn(['mon'], ['id'], 'the columns to keep', 'id');
    expect(r.list).toEqual(['mon']);
    expect(r.error).toMatch(/"id" is already in the columns to keep. Remove it there first/);
  });
  it('says what is missing', () => {
    expect(unpivotMissing(unpivotFromSettings({}))).toHaveLength(3);
    expect(unpivotMissing(unpivotFromSettings(saved))).toEqual([]);
    expect(unpivotMissing({ ...unpivotFromSettings(saved), valueColumn: 'DAY' })[0]).toMatch(/different names/);
  });
});

describe('Pivot', () => {
  const saved = { rowKeys: ['dept'], columnSource: 'day', value: 'hours', aggregation: 'sum', columns: { from: 'data' }, fill: 0, namePrefix: 'd_', nameSuffix: '_h', nameCase: 'upper' };
  it('reads and writes the same settings', () => {
    expect(pivotToSettings(pivotFromSettings(saved), {}).settings).toEqual(saved);
  });
  it('writes only what differs from the default: no fill, prefix, suffix or case', () => {
    const s = pivotToSettings(pivotFromSettings({ rowKeys: [], columnSource: 'c', aggregation: 'count' }), {}).settings!;
    expect(s).toEqual({ rowKeys: [], columnSource: 'c', aggregation: 'count', columns: { from: 'data' } });
  });
  it('reads a reference source and writes it back', () => {
    const ref = { rowKeys: ['e'], columnSource: 'k', value: 'h', aggregation: 'sum', columns: { from: 'reference', table: 'OT types', column: 'ot_type' } };
    expect(pivotFromSettings(ref)).toMatchObject({ from: 'reference', table: 'OT types', column: 'ot_type' });
    expect(pivotToSettings(pivotFromSettings(ref), {}).settings).toEqual(ref);
  });
  it('the fill value is a number, the word blank (null) or empty (default); anything else is refused with what to do', () => {
    expect(parseFill('')).toEqual({ ok: true, fill: undefined });
    expect(parseFill(' 0 ')).toEqual({ ok: true, fill: 0 });
    expect(parseFill('-1.5')).toEqual({ ok: true, fill: -1.5 });
    expect(parseFill('Blank')).toEqual({ ok: true, fill: null });
    const bad = parseFill('abc');
    expect(!bad.ok && bad.message).toMatch(/"abc" is not a number.*the word blank/);
    expect(parseFill('1e3').ok).toBe(false);
    expect(pivotFromSettings({ fill: null }).fill).toBe('blank');
    expect(pivotToSettings(pivotFromSettings({ columnSource: 'c', aggregation: 'sum', value: 'v', fill: null }), {}).settings?.fill).toBeNull();
    expect(pivotToSettings({ ...pivotFromSettings(saved), fill: 'x' }, {}).error).toMatch(/not a number/);
  });
  it('says what is missing: the column source, the value (not for count), the reference table and column', () => {
    expect(pivotMissing(pivotFromSettings({}))).toHaveLength(2);
    expect(pivotMissing(pivotFromSettings({ aggregation: 'count' }))).toHaveLength(1);
    expect(pivotMissing(pivotFromSettings(saved))).toEqual([]);
    expect(pivotMissing({ ...pivotFromSettings(saved), from: 'reference' })[0]).toMatch(/reference table/);
  });
});
