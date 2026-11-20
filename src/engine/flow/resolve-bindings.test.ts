import { describe, expect, it } from 'vitest';
import { resolveParameterValues } from './parameter-values';
import { resolveBindings } from './resolve-bindings';
import type { FlowParameter } from './parameters';
import type { FlowDefinition } from './types';
import { EngineError } from '../types';

const P = (key: string, type: FlowParameter['type'], extra: Partial<FlowParameter> = {}): FlowParameter => ({ key, label: key.toUpperCase(), type, required: false, ...extra });
const def = (type: string, settings: Record<string, unknown>, parameters: FlowParameter[]): FlowDefinition =>
  ({ schemaVersion: 3, parameters, nodes: [{ id: 'n1', type, label: 'My step', settings }], edges: [] }) as unknown as FlowDefinition;
const resolve = (d: FlowDefinition, values: Record<string, string | number | boolean | null>) => resolveBindings(d, resolveParameterValues(d.parameters ?? [], values));
const settingsOf = (d: FlowDefinition) => d.nodes[0]!.settings;
const failure = (fn: () => unknown): EngineError => {
  try {
    fn();
  } catch (e) {
    return e as EngineError;
  }
  throw new Error('no error');
};

describe('resolveBindings', () => {
  it('puts the value of the parameter in place of the binding and leaves the other settings and the input alone', () => {
    const d = def('input_file', { key: 'k', sheet: { $param: 's' }, headerRow: { $param: 'h' } }, [P('s', 'text'), P('h', 'number')]);
    const before = structuredClone(d);
    const r = resolve(d, { s: 'July', h: 3 });
    expect(settingsOf(r)).toEqual({ key: 'k', sheet: 'July', headerRow: 3 });
    expect(d).toEqual(before);
  });
  it('returns the same object when there is no binding', () => {
    const d = def('input_file', { key: 'k' }, []);
    expect(resolve(d, {})).toBe(d);
  });
  it('lets a list parameter fill a text setting, and a choice setting when the value is one of its choices', () => {
    const d = def('lookup_join', { onNoMatch: { $param: 'm' } }, [P('m', 'list', { options: ['drop', 'blank', 'zzz'] })]);
    expect(settingsOf(resolve(d, { m: 'drop' })).onNoMatch).toBe('drop');
    const e = failure(() => resolve(d, { m: 'zzz' }));
    expect(e.messageId).toBe('engine.bindChoice');
    expect(e.message).toContain('blank, drop, fail');
    expect(e.nodeId).toBe('n1');
  });
  it('fills a yes/no setting from a boolean parameter and a number from a number', () => {
    const u = def('unpivot', { nameColumn: 'a', valueColumn: 'b', skipBlank: { $param: 'b' } }, [P('b', 'boolean')]);
    expect(settingsOf(resolve(u, { b: true })).skipBlank).toBe(true);
    const pv = def('pivot', { fill: { $param: 'f' } }, [P('f', 'number')]);
    expect(settingsOf(resolve(pv, { f: 0 })).fill).toBe(0);
  });
  it('refuses a parameter of the wrong type and names the step, the setting and both types', () => {
    const d = def('input_file', { key: 'k', headerRow: { $param: 's' } }, [P('s', 'text')]);
    const e = failure(() => resolve(d, { s: 'x' }));
    expect(e.messageId).toBe('engine.bindType');
    expect(e.nodeId).toBe('n1');
    expect(e.message).toMatch(/My step/);
    expect(e.message).toMatch(/headerRow/);
  });
  it('checks a whole number and its minimum', () => {
    const d = def('input_file', { key: 'k', headerRow: { $param: 'h' } }, [P('h', 'number')]);
    expect(failure(() => resolve(d, { h: 0 })).messageId).toBe('engine.bindNumber');
    expect(failure(() => resolve(d, { h: 1.5 })).messageId).toBe('engine.bindNumber');
    expect(settingsOf(resolve(d, { h: 2 })).headerRow).toBe(2);
  });
  it('a blank optional parameter leaves an optional setting unset', () => {
    const d = def('input_file', { key: 'k', sheet: { $param: 's' } }, [P('s', 'text')]);
    const r = resolve(d, { s: null });
    expect('sheet' in settingsOf(r)).toBe(false);
    expect(settingsOf(r).key).toBe('k');
  });
  it('a blank optional parameter is an error for a required setting', () => {
    const d = def('unpivot', { nameColumn: { $param: 'n' }, valueColumn: 'v' }, [P('n', 'text')]);
    const e = failure(() => resolve(d, { n: null }));
    expect(e.messageId).toBe('engine.bindBlank');
    expect(e.message).toMatch(/My step/);
    expect(e.message).toMatch(/nameColumn/);
  });
  it('refuses a parameter that is not defined', () => {
    const d = def('input_file', { key: 'k', sheet: { $param: 'nope' } }, []);
    expect(failure(() => resolveBindings(d, {})).messageId).toBe('engine.bindUnknown');
  });
});
