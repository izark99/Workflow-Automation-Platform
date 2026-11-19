import { describe, expect, it } from 'vitest';
import { withParameters } from '../../engine/flow/parameters';
import type { FlowParameter } from '../../engine/flow/parameters';
import { emptyDefinition } from './graph';
import { isDirty } from './version-logic';
import { addParameter, changeType, freeKey, moveParameter, optionsFromText, optionsToText, parameterProblems, removeParameter, updateParameter } from './parameters-logic';

const a: FlowParameter = { key: 'a', label: 'A', type: 'date', required: true, default: '2026-09-30' };
const b: FlowParameter = { key: 'b', label: 'B', type: 'list', required: false, options: ['x', 'y'] };

describe('parameters-logic', () => {
  it('adds a required text parameter with a free key', () => {
    const list = addParameter([a]);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ key: 'parameter_2', type: 'text', required: true });
    expect(freeKey([{ ...a, key: 'Parameter_2' }, a])).toBe('parameter_3');
    expect(parameterProblems(addParameter(addParameter([])))).toEqual([]);
  });

  it('moves up and down, and stays put at the edges', () => {
    expect(moveParameter([a, b], 1, -1).map((p) => p.key)).toEqual(['b', 'a']);
    expect(moveParameter([a, b], 0, 1).map((p) => p.key)).toEqual(['b', 'a']);
    expect(moveParameter([a, b], 0, -1).map((p) => p.key)).toEqual(['a', 'b']);
    expect(moveParameter([a, b], 1, 1).map((p) => p.key)).toEqual(['a', 'b']);
  });

  it('removes a parameter', () => {
    expect(removeParameter([a, b], 0)).toEqual([b]);
  });

  it('changing the type drops the default and keeps the rest', () => {
    const r = changeType([a], 0, 'list');
    expect(r[0]).toEqual({ key: 'a', label: 'A', type: 'list', required: true, options: [] });
    const back = changeType(r, 0, 'text');
    expect('options' in back[0]!).toBe(false);
  });

  it('an empty default or help is left out of the stored parameter', () => {
    const r = updateParameter([a], 0, { default: undefined, help: '' });
    expect('default' in r[0]!).toBe(false);
    expect('help' in r[0]!).toBe(false);
  });

  it('writes options as lines and reads them back without blank lines', () => {
    expect(optionsToText(['x', 'y'])).toBe('x\ny');
    expect(optionsFromText(' x \n\n y\n')).toEqual(['x', 'y']);
  });

  it('reports the problems of the engine in the catalog language', () => {
    const problems = parameterProblems([{ ...a, key: '1bad' }, { ...b, options: [] }, { ...a, key: 'B' }, { ...a, key: 'b' }]);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.join(' ')).toMatch(/1bad/);
  });

  it('an edit that adds no parameter leaves the definition equal, so a draft is not unsaved', () => {
    const def = emptyDefinition();
    expect(isDirty(withParameters(def, []), def)).toBe(false);
    const withOne = withParameters(def, [a]);
    expect(withOne.schemaVersion).toBe(2);
    expect(isDirty(withOne, def)).toBe(true);
  });
});
