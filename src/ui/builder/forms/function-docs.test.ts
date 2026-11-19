import { describe, expect, it } from 'vitest';
import { defaultFunctions } from '../../../engine/formula/tier1';
import { COMMON_FUNCTIONS, FUNCTION_DOCS, GROUP_ORDER, searchFunctions } from './function-docs';

describe('function list', () => {
  it('lists exactly the functions that the engine registers, each once', () => {
    // PARAM is built into the compiler, because it reads the parameters of the flow.
    expect(FUNCTION_DOCS.map((f) => f.name).sort()).toEqual([...Object.keys(defaultFunctions), 'PARAM'].sort());
    expect(new Set(FUNCTION_DOCS.map((f) => f.name)).size).toBe(FUNCTION_DOCS.length);
  });
  it('each entry has a signature that starts with its name, a group and a text', () => {
    for (const f of FUNCTION_DOCS) {
      expect(f.signature.startsWith(`${f.name}(`)).toBe(true);
      expect(GROUP_ORDER).toContain(f.group);
      expect(f.text.length).toBeGreaterThan(10);
    }
  });
  it('the buttons next to the editor are real functions', () => {
    for (const n of COMMON_FUNCTIONS) expect(defaultFunctions[n]).toBeDefined();
  });
  it('a signature without "..." lists every argument that the engine takes, optional ones too', () => {
    const wrong: string[] = [];
    for (const doc of FUNCTION_DOCS) {
      if (doc.signature.includes('...')) continue;
      const spec = defaultFunctions[doc.name];
      if (!spec) continue; // PARAM takes one key, written in the formula
      const inner = doc.signature.slice(doc.signature.indexOf('(') + 1, -1).trim();
      const n = inner === '' ? 0 : inner.split(',').length;
      if (n !== spec.max) wrong.push(`${doc.name}: signature has ${n}, engine takes ${spec.min} to ${spec.max}`);
    }
    expect(wrong).toEqual([]);
  });
  it('searches name, signature and text, ignoring case', () => {
    expect(searchFunctions('round').map((f) => f.name)).toEqual(expect.arrayContaining(['ROUND', 'ROUNDUP', 'ROUNDDOWN']));
    expect(searchFunctions('  ').length).toBe(FUNCTION_DOCS.length);
    expect(searchFunctions('weekday').some((f) => f.name === 'WEEKDAY')).toBe(true);
    expect(searchFunctions('no such thing at all')).toEqual([]);
  });
});
