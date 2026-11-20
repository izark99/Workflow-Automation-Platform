import { describe, expect, it } from 'vitest';
import type { FlowParameter } from './parameters';
import { parametersUsedBy, withUsedParametersOnly } from './parameters-used';
import type { FlowDefinition } from './types';

const p = (key: string): FlowParameter => ({ key, label: key, type: 'text', required: true });
const node = (id: string, type: string, settings: Record<string, unknown>) => ({ id, type, settings });
const def = (nodes: ReturnType<typeof node>[], parameters: FlowParameter[]): FlowDefinition =>
  ({ schemaVersion: 2, nodes, edges: [], parameters }) as unknown as FlowDefinition;

describe('parametersUsedBy', () => {
  it('finds a PARAM in a filter, a formula column and an output sort, ignoring case and spaces', () => {
    const d = def(
      [node('f', 'filter', { condition: '[a] > param( "one" )' }), node('c', 'formula_column', { name: 'x', expression: 'PARAM("Two") + 1' }), node('o', 'output', { sort: [{ kind: 'formula', expression: 'PARAM("three")' }] })],
      [p('one'), p('two'), p('three'), p('unused')],
    );
    expect(parametersUsedBy(d).map((x) => x.key)).toEqual(['one', 'two', 'three']);
  });

  it('a SQL step that reads params needs every parameter; one that does not, none', () => {
    const all = [p('a'), p('b')];
    expect(parametersUsedBy(def([node('s', 'sql', { sql: 'SELECT * FROM in1, params' })], all)).map((x) => x.key)).toEqual(['a', 'b']);
    expect(parametersUsedBy(def([node('s', 'sql', { sql: 'SELECT * FROM in1' })], all))).toEqual([]);
  });

  it('a parameter that a setting is bound to is used, also in the steps before the selected one', () => {
    const d = def([node('i', 'input_file', { key: 'k', sheet: { $param: 'sheet' } }), node('o', 'output', { file: 'F', sheet: { $param: 'Other' } })], [p('sheet'), p('other'), p('unused')]);
    expect(parametersUsedBy(d).map((x) => x.key)).toEqual(['sheet', 'other']);
  });

  it('is empty without parameters, and ignores a key that is not a parameter', () => {
    expect(parametersUsedBy(def([node('f', 'filter', { condition: 'PARAM("a")' })], []))).toEqual([]);
    expect(parametersUsedBy(def([node('f', 'filter', { condition: 'PARAM("zzz")' })], [p('a')]))).toEqual([]);
  });

  it('withUsedParametersOnly keeps only those, and returns a definition without parameters as it is', () => {
    const d = def([node('f', 'filter', { condition: 'PARAM("a")' })], [p('a'), p('b')]);
    expect(withUsedParametersOnly(d).parameters?.map((x) => x.key)).toEqual(['a']);
    expect(d.parameters).toHaveLength(2);
    const bare = { schemaVersion: 1, nodes: [], edges: [] } as unknown as FlowDefinition;
    expect(withUsedParametersOnly(bare)).toBe(bare);
  });
});
