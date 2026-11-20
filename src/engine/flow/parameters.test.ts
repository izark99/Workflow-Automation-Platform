import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARAMETER_TYPES, fitsParameterType, parametersOf, withParameters } from './parameters';
import type { FlowParameter } from './parameters';
import { flowJsonSchema, BASE_SCHEMA_VERSION, FLOW_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './types';
import type { FlowDefinition } from './types';
import { validateFlow } from './validate';

const base = { nodes: [{ id: 'a', type: 'input_file', settings: {} }, { id: 'b', type: 'output', settings: {} }], edges: [{ source: 'a', target: 'b' }] };
const v2 = (parameters?: unknown) => ({ schemaVersion: 2, ...base, ...(parameters === undefined ? {} : { parameters }) });
const messageIds = (input: unknown): string[] => {
  const r = validateFlow(input);
  return r.ok ? [] : r.errors.map((e) => e.messageId ?? e.code);
};
const date: FlowParameter = { key: 'period_end', label: 'Period end', type: 'date', required: true, default: '2026-09-30', help: 'The last day of the period.' };

describe('versions of the definition format', () => {
  it('reads version 1, 2 and 3, and says which versions it reads', () => {
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2, 3]);
    expect(BASE_SCHEMA_VERSION).toBe(1);
    expect(FLOW_SCHEMA_VERSION).toBe(3);
    expect(validateFlow({ schemaVersion: 1, ...base }).ok).toBe(true);
    expect(validateFlow(v2()).ok).toBe(true);
    const r = validateFlow({ schemaVersion: 4, ...base });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]!.message).toMatch(/versions 1, 2 and 3/);
    expect([...flowJsonSchema.properties.schemaVersion.enum]).toEqual([1, 2, 3]);
  });

  it('an older definition loads with an empty list of parameters and is not changed', () => {
    const stored = { schemaVersion: 1, ...base };
    const before = JSON.stringify(stored);
    const r = validateFlow(stored);
    expect(r.ok && r.flow.parameters).toEqual([]);
    expect(JSON.stringify(stored)).toBe(before);
    expect('parameters' in stored).toBe(false);
  });

  it('the acceptance flow file loads as it is: valid, no parameters, and the input is untouched', () => {
    const file = readFileSync('flows/monthly-timesheet.flow.json', 'utf8');
    const stored = JSON.parse(file) as unknown;
    const r = validateFlow(stored);
    expect(r.ok).toBe(true);
    expect(r.ok && r.flow.parameters).toEqual([]);
    expect(JSON.stringify(stored)).toBe(JSON.stringify(JSON.parse(file)));
    expect((stored as { schemaVersion: number }).schemaVersion).toBe(1);
    expect('parameters' in (stored as object)).toBe(false);
  });

  it('a version 1 definition with parameters is refused with a clear message, not ignored', () => {
    const r = validateFlow({ schemaVersion: 1, ...base, parameters: [date] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatchObject({ messageId: 'engine.paramNeedsV2' });
    expect(!r.ok && r.errors[0]!.message).toMatch(/Set schemaVersion to 2/);
  });
});

describe('parameters of a version 2 definition', () => {
  it('accepts every type with a default that fits', () => {
    const list = [
      date,
      { key: 'department', label: 'Department', type: 'text', required: false, default: 'HR' },
      { key: 'limit', label: 'Limit', type: 'number', required: false, default: 8.5 },
      { key: 'ready', label: 'Ready', type: 'boolean', required: true, default: false },
      { key: 'kind', label: 'Kind', type: 'list', required: true, options: ['a', 'b'], default: 'b' },
      { key: 'plain', label: 'No default', type: 'text', required: true },
    ];
    const r = validateFlow(v2(list));
    expect(r.ok && r.flow.parameters).toEqual(list);
    expect(PARAMETER_TYPES).toHaveLength(5);
  });

  it('accepts an empty list and a missing list', () => {
    expect(validateFlow(v2([])).ok).toBe(true);
    const r = validateFlow(v2());
    expect(r.ok && r.flow.parameters).toEqual([]);
  });

  it('checks the key: the pattern, the length and the uniqueness without regard to case', () => {
    expect(messageIds(v2([{ ...date, key: '1abc' }]))).toEqual(['engine.paramKey']);
    expect(messageIds(v2([{ ...date, key: 'has space' }]))).toEqual(['engine.paramKey']);
    expect(messageIds(v2([{ ...date, key: '' }]))).toEqual(['engine.paramKey']);
    expect(messageIds(v2([{ ...date, key: 'k'.repeat(41) }]))).toEqual(['engine.paramKey']);
    expect(messageIds(v2([{ ...date, key: '_ok_1' }])).length).toBe(0);
    expect(messageIds(v2([date, { ...date, key: 'PERIOD_END' }]))).toEqual(['engine.paramDuplicateKey']);
    const r = validateFlow(v2([date, { ...date, key: 'Period_End' }]));
    expect(!r.ok && r.errors[0]!.message).toContain('"Period_End"');
  });

  it('checks the label, the type, required and the help', () => {
    expect(messageIds(v2([{ ...date, label: '  ' }]))).toEqual(['engine.paramLabel']);
    expect(messageIds(v2([{ ...date, type: 'color' }]))).toEqual(['engine.paramType']);
    const r = validateFlow(v2([{ ...date, type: 'color' }]));
    expect(!r.ok && r.errors[0]!.message).toContain('"period_end"');
    expect(messageIds(v2([{ ...date, required: 'yes' }]))).toEqual(['engine.paramRequired']);
    expect(messageIds(v2([{ ...date, help: 5 }]))).toEqual(['engine.paramHelp']);
    expect(messageIds(v2(['text']))).toEqual(['engine.paramShape']);
    expect(messageIds(v2({ not: 'a list' }))).toEqual(['engine.paramNotList']);
  });

  it('checks that the default fits the type', () => {
    expect(messageIds(v2([{ ...date, default: '2026-02-30' }]))).toEqual(['engine.paramDefaultDate']);
    expect(messageIds(v2([{ ...date, default: 20260930 }]))).toEqual(['engine.paramDefaultDate']);
    expect(messageIds(v2([{ key: 'n', label: 'N', type: 'number', required: false, default: '5' }]))).toEqual(['engine.paramDefaultNumber']);
    expect(messageIds(v2([{ key: 'n', label: 'N', type: 'number', required: false, default: Infinity }]))).toHaveLength(1);
    expect(messageIds(v2([{ key: 'b', label: 'B', type: 'boolean', required: false, default: 'true' }]))).toEqual(['engine.paramDefaultBoolean']);
    expect(messageIds(v2([{ key: 't', label: 'T', type: 'text', required: false, default: 3 }]))).toEqual(['engine.paramDefaultText']);
    expect(messageIds(v2([{ key: 'l', label: 'L', type: 'list', required: false, options: ['a'], default: 'z' }]))).toEqual(['engine.paramDefaultList']);
  });

  it('a list needs different, non-empty options', () => {
    expect(messageIds(v2([{ key: 'l', label: 'L', type: 'list', required: false }]))).toEqual(['engine.paramOptions']);
    expect(messageIds(v2([{ key: 'l', label: 'L', type: 'list', required: false, options: [] }]))).toEqual(['engine.paramOptions']);
    expect(messageIds(v2([{ key: 'l', label: 'L', type: 'list', required: false, options: ['a', 'a'] }]))).toEqual(['engine.paramOptionBad']);
    expect(messageIds(v2([{ key: 'l', label: 'L', type: 'list', required: false, options: ['a', ''] }]))).toEqual(['engine.paramOptionBad']);
  });

  it('the errors name the parameter and carry a message id with its parameters', () => {
    const r = validateFlow(v2([{ ...date, default: 'soon' }]));
    expect(!r.ok && r.errors[0]).toMatchObject({ code: 'invalid_parameters', messageId: 'engine.paramDefaultDate', params: { key: 'period_end' } });
    expect(!r.ok && r.errors[0]!.message).toContain('period_end');
  });
});

describe('withParameters and fitsParameterType', () => {
  const def = { schemaVersion: 1, ...base } as FlowDefinition;
  it('writes version 2 only when there is something to write', () => {
    expect(withParameters(def, [])).toBe(def);
    const next = withParameters(def, [date]);
    expect(next).toMatchObject({ schemaVersion: 2, parameters: [date] });
    expect(def.schemaVersion).toBe(1);
    expect('parameters' in def).toBe(false);
    expect(parametersOf(next)).toEqual([date]);
    expect(parametersOf(def)).toEqual([]);
    // removing the last parameter of a version 2 definition keeps it version 2 with an empty list
    expect(withParameters(next, [])).toMatchObject({ schemaVersion: 2, parameters: [] });
  });
  it('knows what fits a type', () => {
    expect(fitsParameterType({ type: 'date' }, '2026-09-30')).toBe(true);
    expect(fitsParameterType({ type: 'date' }, '30 Sep 2026')).toBe(false);
    expect(fitsParameterType({ type: 'number' }, NaN)).toBe(false);
    expect(fitsParameterType({ type: 'list', options: ['a'] }, 'a')).toBe(true);
    expect(fitsParameterType({ type: 'list', options: ['a'] }, 'b')).toBe(false);
    expect(fitsParameterType({ type: 'boolean' }, true)).toBe(true);
  });
});
