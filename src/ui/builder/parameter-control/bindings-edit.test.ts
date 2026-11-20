import { describe, expect, it } from 'vitest';
import { bindSetting, boundNames, hiddenFromForm, putBindingsBack, unbindSetting } from './bindings-edit';

const input = { key: 'k', sheet: { $param: 'p' }, headerRow: 2 };

describe('boundNames', () => {
  it('lists the settings that hold a binding, in the order of the settings', () => {
    expect(boundNames(input)).toEqual(['sheet']);
    expect(boundNames({ a: 1, b: { $param: 'x' }, c: { $param: 'y' }, d: { $param: 3 } })).toEqual(['b', 'c']);
    expect(boundNames({})).toEqual([]);
  });
});

describe('hiddenFromForm', () => {
  it('puts the placeholder of the setting where a binding is, so that the form holds a valid value', () => {
    expect(hiddenFromForm('input_file', input)).toEqual({ key: 'k', sheet: 'Sheet1', headerRow: 2 });
    expect(hiddenFromForm('output', { sheet: { $param: 'p' }, format: { $param: 'q' } })).toEqual({ sheet: 'Sheet1', format: 'xlsx' });
  });
  it('returns the same settings when nothing is bound', () => {
    const plain = { key: 'k' };
    expect(hiddenFromForm('input_file', plain)).toBe(plain);
  });
});

describe('putBindingsBack', () => {
  it('writes the bindings of the current settings over what the form saved, and keeps everything else of the form', () => {
    expect(putBindingsBack({ key: 'k2', sheet: 'Sheet1', headerRow: 3 }, input)).toEqual({ key: 'k2', sheet: { $param: 'p' }, headerRow: 3 });
  });
  it('does nothing when no setting is bound', () => {
    const saved = { key: 'k' };
    expect(putBindingsBack(saved, { key: 'k' })).toBe(saved);
  });
});

describe('bindSetting and unbindSetting', () => {
  it('binds a setting, leaving the others, and does not change its input', () => {
    const before = { key: 'k', headerRow: 2 };
    expect(bindSetting(before, 'headerRow', 'h')).toEqual({ key: 'k', headerRow: { $param: 'h' } });
    expect(before).toEqual({ key: 'k', headerRow: 2 });
  });
  it('gives the field back with its last fixed value, or unsets it when it had none and may be unset', () => {
    expect(unbindSetting('input_file', input, 'sheet', 'July')).toEqual({ key: 'k', sheet: 'July', headerRow: 2 });
    const unset = unbindSetting('input_file', input, 'sheet', undefined);
    expect('sheet' in unset).toBe(false);
    expect(unset).toEqual({ key: 'k', headerRow: 2 });
  });
  it('a required setting with no last value gets its placeholder, so that the form is valid again', () => {
    expect(unbindSetting('output', { file: 'F', sheet: { $param: 'p' } }, 'sheet', undefined)).toEqual({ file: 'F', sheet: 'Sheet1' });
  });
});
