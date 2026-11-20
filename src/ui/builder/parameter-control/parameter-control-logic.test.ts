import { describe, expect, it } from 'vitest';
import type { BindableSetting } from '../../../engine/flow/bindable';
import type { FlowParameter } from '../../../engine/flow/parameters';
import type { FlowNode } from '../../../engine/flow/types';
import { bindingView, nowText, parametersThatFit, stepBindingResults } from './parameter-control-logic';

const P = (key: string, type: FlowParameter['type'], label = key.toUpperCase()): FlowParameter => ({ key, label, type, required: false });
const params = [P('t', 'text'), P('n', 'number'), P('d', 'date'), P('b', 'boolean'), P('l', 'list')];
const setting = (type: BindableSetting['type']): BindableSetting => ({ name: 's', type, optional: true, placeholder: 'x', ...(type === 'choice' ? { choices: ['x', 'y'] } : {}) });
const keys = (type: BindableSetting['type']) => parametersThatFit(params, setting(type)).map((p) => p.key);

describe('parametersThatFit', () => {
  it('a text setting takes a text or a list parameter', () => expect(keys('text')).toEqual(['t', 'l']));
  it('a number, a date and a yes/no setting take their own type only', () => {
    expect(keys('number')).toEqual(['n']);
    expect(keys('date')).toEqual(['d']);
    expect(keys('boolean')).toEqual(['b']);
  });
  it('a setting of fixed choices takes a list or a text parameter (the value is checked against the choices before the run)', () => expect(keys('choice')).toEqual(['t', 'l']));
  it('keeps the order of the flow and finds nothing in a flow with no parameters', () => {
    expect(parametersThatFit([], setting('text'))).toEqual([]);
    expect(parametersThatFit([P('z', 'text'), P('a', 'text')], setting('text')).map((p) => p.key)).toEqual(['z', 'a']);
  });
});

describe('bindingView', () => {
  it('a plain value is fixed', () => {
    for (const v of ['Sheet1', 3, true, undefined, null, '']) expect(bindingView(v, params)).toEqual({ kind: 'fixed' });
  });
  it('a binding to a parameter of the flow is bound, with its label', () => {
    expect(bindingView({ $param: 'n' }, params)).toMatchObject({ kind: 'bound', key: 'n', label: 'N' });
  });
  it('a binding to a parameter that is gone is missing, with its key', () => {
    expect(bindingView({ $param: 'old' }, params)).toEqual({ kind: 'missing', key: 'old' });
  });
  it('an object that is not a binding is a fixed value', () => {
    expect(bindingView({ $param: 3 }, params)).toEqual({ kind: 'fixed' });
  });
});

describe('nowText', () => {
  it('writes each type in the words of the screens', () => {
    expect(nowText('text', 'July')).toBe('Now: July');
    expect(nowText('list', 'drop')).toBe('Now: drop');
    expect(nowText('number', 3)).toBe('Now: 3');
    expect(nowText('date', '2026-09-30')).toBe('Now: 30 Sep 2026');
    expect(nowText('boolean', true)).toBe('Now: Yes');
    expect(nowText('boolean', false)).toBe('Now: No');
  });
  it('says so when the value is blank', () => {
    expect(nowText('text', null)).toBe('Now: (blank)');
  });
});

describe('stepBindingResults', () => {
  const step = (type: FlowNode['type'], settings: Record<string, unknown>): FlowNode => ({ id: 's', type, label: 'My step', settings });
  const ps: FlowParameter[] = [{ key: 'sheet', label: 'Sheet', type: 'text', required: true }, { key: 'row', label: 'Row', type: 'number', required: false }, { key: 'kind', label: 'Kind', type: 'list', required: false, options: ['xlsx', 'csv'] }];
  const input = step('input_file', { key: 'k', sheet: { $param: 'sheet' }, headerRow: { $param: 'row' } });

  it('gives the value of each bound setting from the values, with a number as a number', () => {
    const r = stepBindingResults(input, ps, { sheet: 'July', row: 3 });
    expect(r.map((x) => [x.setting, x.outcome])).toEqual([['sheet', { ok: true, value: 'July' }], ['headerRow', { ok: true, value: 3 }]]);
  });
  it('reports a missing required value, a value of the wrong kind for the setting, and a choice that is not one of the choices', () => {
    const r = stepBindingResults(input, ps, { row: 0 });
    expect(r[0]!.outcome).toMatchObject({ ok: false, error: expect.stringContaining('needs a value') });
    expect(r[1]!.outcome).toMatchObject({ ok: false, error: expect.stringContaining('whole number of 1 or more') });
    const out = stepBindingResults(step('lookup_join', { onNoMatch: { $param: 'kind' } }), ps, { kind: 'csv' });
    expect(out[0]!.outcome).toMatchObject({ ok: false, error: expect.stringContaining('blank, drop, fail') });
  });
  it('a blank optional parameter leaves an optional setting unset, which is a blank value', () => {
    const r = stepBindingResults(step('input_file', { key: 'k', headerRow: { $param: 'row' } }), ps, { row: null });
    expect(r[0]!.outcome).toEqual({ ok: true, value: null });
  });
  it('a deleted parameter is an error that names the setting, and the result keeps its key', () => {
    const r = stepBindingResults(step('input_file', { key: 'k', sheet: { $param: 'gone' } }), ps, {});
    expect(r[0]).toMatchObject({ key: 'gone', param: undefined });
    expect(r[0]!.outcome).toMatchObject({ ok: false, error: expect.stringContaining('gone') });
  });
  it('lists only the settings that hold a binding, in the order of the settings', () => {
    expect(stepBindingResults(step('input_file', { key: 'k', headerRow: 1 }), ps, {})).toEqual([]);
  });
});
