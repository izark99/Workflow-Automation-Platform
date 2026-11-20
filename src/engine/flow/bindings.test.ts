import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bindingsOf, isParamBinding, withBindingsVersion } from './bindings';
import { validateFlow } from './validate';
import type { FlowDefinition } from './types';

const timesheetPath = new URL('../../../flows/monthly-timesheet.flow.json', import.meta.url);
const period = { key: 'sheet', label: 'Sheet', type: 'text', required: true };
const flow = (settings: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  parameters: [period],
  nodes: [{ id: 'in', type: 'input_file', label: 'People', settings }],
  edges: [],
  ...over,
});
const ids = (input: unknown): string[] => {
  const r = validateFlow(input);
  return r.ok ? [] : r.errors.map((e) => e.messageId ?? e.code);
};

describe('isParamBinding', () => {
  it('is an object with a text $param and nothing else', () => {
    expect(isParamBinding({ $param: 'sheet' })).toBe(true);
    for (const v of [{ $param: 3 }, { $param: '' }, { $param: 'a', other: 1 }, 'sheet', null, [], { param: 'a' }]) expect(isParamBinding(v)).toBe(false);
  });
});

describe('a binding in a definition of schemaVersion 3', () => {
  it('is accepted for a known parameter', () => {
    expect(validateFlow(flow({ key: 'people', sheet: { $param: 'sheet' } })).ok).toBe(true);
  });
  it('is an error for a parameter the flow does not define, and names the step, the setting and the key', () => {
    const r = validateFlow(flow({ sheet: { $param: 'nope' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatchObject({ messageId: 'engine.bindUnknown', nodeId: 'in', params: { step: 'People', setting: 'sheet', key: 'nope' } });
      expect(r.errors[0]!.message).toContain('nope');
    }
  });
  it('is an error when it is not an object with a text key', () => {
    for (const bad of [{ $param: 3 }, { $param: '' }, { $param: 'sheet', extra: true }]) expect(ids(flow({ sheet: bad }))).toEqual(['engine.bindShape']);
  });
  it('is an error inside a list or a nested object (only a single-value setting takes one)', () => {
    expect(ids(flow({ rows: [{ name: { $param: 'sheet' } }] }))).toEqual(['engine.bindNotHere']);
    expect(ids(flow({ source: { kind: 'x', table: { $param: 'sheet' } } }))).toEqual(['engine.bindNotHere']);
  });
  it('needs schemaVersion 3', () => {
    expect(ids(flow({ sheet: { $param: 'sheet' } }, { schemaVersion: 2 }))).toEqual(['engine.bindNeedsV3']);
    expect(ids(flow({ sheet: { $param: 'sheet' } }, { schemaVersion: 1, parameters: undefined }))).toEqual(['engine.bindNeedsV3', 'engine.bindUnknown']);
  });
  it('a definition of version 3 without any binding or parameter is fine, and parameters are allowed in version 3', () => {
    expect(validateFlow(flow({}, { parameters: undefined })).ok).toBe(true);
    expect(validateFlow(flow({})).ok).toBe(true);
  });
});

describe('bindingsOf and withBindingsVersion', () => {
  const def = flow({ sheet: { $param: 'sheet' }, headerRow: 1 }) as unknown as FlowDefinition;
  it('lists every binding with its step and setting', () => {
    expect(bindingsOf(def)).toEqual([{ nodeId: 'in', setting: 'sheet', key: 'sheet' }]);
    expect(bindingsOf({ ...def, nodes: [] })).toEqual([]);
  });
  it('writes version 3 only when a binding exists, and never lowers a version', () => {
    expect(withBindingsVersion({ ...def, schemaVersion: 2 }).schemaVersion).toBe(3);
    const plain = { schemaVersion: 1, nodes: [], edges: [] } as FlowDefinition;
    expect(withBindingsVersion(plain)).toBe(plain);
    expect(withBindingsVersion(def)).toBe(def);
  });
});

describe('older definitions', () => {
  it('the acceptance flow is still schemaVersion 1, validates, and is not changed by loading it', () => {
    const text = readFileSync(timesheetPath, 'utf8');
    const loaded = JSON.parse(text) as FlowDefinition;
    expect(loaded.schemaVersion).toBe(1);
    const r = validateFlow(loaded);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flow.schemaVersion).toBe(1);
    expect(withBindingsVersion(loaded)).toBe(loaded);
    expect(bindingsOf(loaded)).toEqual([]);
    expect(JSON.parse(text)).toEqual(loaded);
  });
});
