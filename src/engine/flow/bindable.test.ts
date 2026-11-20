import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BINDABLE_SETTINGS, NOT_BINDABLE_SETTINGS, bindableSetting, isBindable } from './bindable';
import { NODE_TYPES, type NodeType } from './types';
import { validateFlow } from './validate';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** The module (and the part of it) that reads the settings of each step type. */
const SOURCES: Record<NodeType, { file: string; from?: string; to?: string }> = {
  input_file: { file: 'engine/input/load.ts', from: 'export function parseInputSettings', to: 'const MIDNIGHT' },
  reference_table: { file: 'engine/nodes/reference-table.ts' },
  column_mapping: { file: 'engine/nodes/column-mapping.ts' },
  filter: { file: 'engine/nodes/filter.ts' },
  formula_column: { file: 'engine/nodes/formula-column.ts' },
  lookup_join: { file: 'engine/nodes/lookup-join.ts' },
  group_by: { file: 'engine/nodes/group-by.ts' },
  unpivot: { file: 'engine/nodes/unpivot.ts' },
  pivot: { file: 'engine/nodes/pivot.ts' },
  append: { file: 'engine/nodes/append.ts' },
  output: { file: 'engine/nodes/output.ts' },
  sql: { file: 'engine/nodes/sql-node.ts' },
};

/** The names that a module reads from the settings of its step: `raw.x`, `settings.x`, and the `int('x')` or `text('x')` helpers. */
function settingsRead(type: NodeType): string[] {
  const src = SOURCES[type];
  let code = read(src.file);
  if (src.from) code = code.slice(code.indexOf(src.from), code.indexOf(src.to!));
  const names = new Set<string>();
  for (const m of code.matchAll(/\b(?:raw|settings)\.(\w+)/g)) names.add(m[1]!);
  for (const m of code.matchAll(/\braw\['(\w+)'\]/g)) names.add(m[1]!);
  for (const m of code.matchAll(/\b(?:int|text)\('(\w+)'/g)) names.add(m[1]!);
  return [...names].sort();
}

describe('the registry of settings that take a parameter', () => {
  it('has an entry for every step type', () => {
    for (const type of NODE_TYPES) {
      expect(BINDABLE_SETTINGS[type], type).toBeDefined();
      expect(NOT_BINDABLE_SETTINGS[type], type).toBeDefined();
    }
  });

  for (const type of NODE_TYPES) {
    it(`${type}: every setting that the module reads is in the registry or in the exclusions, and nothing else is listed`, () => {
      const listed = [...BINDABLE_SETTINGS[type].map((s) => s.name), ...Object.keys(NOT_BINDABLE_SETTINGS[type])].sort();
      expect(settingsRead(type)).toEqual(listed);
    });

    it(`${type}: no setting is in both lists, and a choice has choices`, () => {
      for (const s of BINDABLE_SETTINGS[type]) {
        expect(NOT_BINDABLE_SETTINGS[type][s.name], `${type}.${s.name}`).toBeUndefined();
        if (s.type === 'choice') expect(s.choices?.length, `${type}.${s.name}`).toBeGreaterThan(0);
        else expect(s.choices).toBeUndefined();
        if (s.type !== 'number') expect(s.integer ?? s.min).toBeUndefined();
      }
      for (const [name, reason] of Object.entries(NOT_BINDABLE_SETTINGS[type])) expect(reason, `${type}.${name}`).not.toBe('');
    });
  }

  it('describes the settings that the spec names', () => {
    expect(bindableSetting('input_file', 'sheet')).toMatchObject({ type: 'text', optional: true });
    expect(bindableSetting('input_file', 'headerRow')).toMatchObject({ type: 'number', integer: true, min: 1 });
    expect(bindableSetting('output', 'file')).toMatchObject({ type: 'text' });
    expect(bindableSetting('pivot', 'fill')).toMatchObject({ type: 'number', optional: true });
    expect(bindableSetting('unpivot', 'nameColumn')).toMatchObject({ type: 'text', optional: false });
    expect(bindableSetting('lookup_join', 'onNoMatch')).toMatchObject({ type: 'choice', choices: ['blank', 'drop', 'fail'] });
    expect(bindableSetting('pivot', 'aggregation')?.choices).toEqual(['sum', 'count', 'min', 'max', 'average']);
    expect(isBindable('filter', 'condition')).toBe(false);
    expect(isBindable('input_file', 'key')).toBe(false);
    expect(isBindable('input_file', 'nope')).toBe(false);
  });
});

describe('validation uses the registry', () => {
  const flow = (type: string, settings: Record<string, unknown>) => ({
    schemaVersion: 3,
    parameters: [{ key: 'p', label: 'P', type: 'text', required: true }],
    nodes: [{ id: 'a', type, settings }],
    edges: [],
  });
  const ids = (input: unknown): string[] => {
    const r = validateFlow(input);
    return r.ok ? [] : r.errors.map((e) => e.messageId ?? e.code).filter((id) => id.startsWith('engine.bind')); // other errors (a step without its input) are not the subject here
  };
  it('refuses a parameter in a setting that cannot take one, and in one that does not exist', () => {
    expect(ids(flow('input_file', { key: { $param: 'p' } }))).toEqual(['engine.bindNotHere']);
    expect(ids(flow('filter', { condition: { $param: 'p' } }))).toEqual(['engine.bindNotHere']);
    expect(ids(flow('input_file', { nonsense: { $param: 'p' } }))).toEqual(['engine.bindNotHere']);
  });
  it('accepts a parameter in a setting of the registry', () => {
    expect(ids(flow('input_file', { key: 'k', sheet: { $param: 'p' } }))).toEqual([]);
    expect(ids(flow('output', { sheet: { $param: 'p' }, file: { $param: 'p' } }))).toEqual([]);
  });
});
