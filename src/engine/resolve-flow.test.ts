import { describe, expect, it } from 'vitest';
import { resolveFlow } from './run';
import type { EngineError } from './types';

const flow = {
  schemaVersion: 3,
  parameters: [
    { key: 'file', label: 'File', type: 'text', required: true },
    { key: 'sheet', label: 'Sheet', type: 'text', required: true },
  ],
  nodes: [
    { id: 'in', type: 'input_file', settings: { key: 'k' } },
    { id: 'out', type: 'output', settings: { file: { $param: 'file' }, format: 'xlsx', sheet: { $param: 'sheet' } } },
  ],
  edges: [{ source: 'in', target: 'out' }],
};
const failure = (fn: () => unknown): EngineError => {
  try {
    fn();
  } catch (e) {
    return e as EngineError;
  }
  throw new Error('no error');
};

describe('resolveFlow', () => {
  it('puts the values in place of the bindings, so that code that reads the settings sees plain values', () => {
    const { flow: resolved, parameters } = resolveFlow(flow, { file: 'June report', sheet: 'Summary' });
    expect(resolved.nodes[1]!.settings).toEqual({ file: 'June report', format: 'xlsx', sheet: 'Summary' });
    expect(parameters.file).toEqual({ type: 'text', value: 'June report' });
    expect(flow.nodes[1]!.settings.file).toEqual({ $param: 'file' });
  });
  it('reads a version 1 definition that has no parameters, and a definition with no binding comes back with its settings as they were', () => {
    const v1 = { schemaVersion: 1, nodes: [{ id: 'in', type: 'input_file', settings: { key: 'k', headerRow: 2 } }], edges: [] };
    expect(resolveFlow(v1).flow.nodes[0]!.settings).toEqual({ key: 'k', headerRow: 2 });
  });
  it('stops for a flow that is not valid, a missing value, and a value that the setting cannot take', () => {
    expect(failure(() => resolveFlow({ nodes: [] })).code).toBe('invalid_flow');
    expect(failure(() => resolveFlow(flow, { file: 'F' })).messageId).toBe('engine.paramMissing');
    expect(failure(() => resolveFlow({ ...flow, nodes: [flow.nodes[0], { ...flow.nodes[1], settings: { file: 'F', format: { $param: 'sheet' }, sheet: 'S' } }] }, { file: 'F', sheet: 'xml' })).messageId).toBe('engine.bindChoice');
  });
});
