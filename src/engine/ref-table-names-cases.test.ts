import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { referencedTables } from './versions';

// The database function `ref_table_names()` (migrations 16 and 18) and `referencedTables()` of the engine are one rule.
// Both are tested on the same list of cases: this file runs each case through the engine and checks that the pgTAP test
// of migration 18 has the same case with the same answer, so the two cannot drift apart.
interface Case {
  name: string;
  definition: unknown;
  expected: string[];
}
const cases = JSON.parse(readFileSync(new URL('../../supabase/tests/ref-table-names-cases.json', import.meta.url), 'utf8')) as Case[];
const sql = readFileSync(new URL('../../supabase/tests/database/170-reference-table-step.test.sql', import.meta.url), 'utf8');
const sqlArray = (e: string[]): string => (e.length === 0 ? "'{}'::text[]" : `array[${e.map((x) => `'${x}'`).join(',')}]`);

describe('the cases of ref_table_names() and referencedTables()', () => {
  it('has the cases of migration 16 and of the Reference table step', () => {
    expect(cases.length).toBeGreaterThanOrEqual(18);
    expect(cases.some((c) => JSON.stringify(c.definition).includes('reference_table'))).toBe(true);
  });
  for (const c of cases) {
    it(`engine: ${c.name}`, () => {
      expect([...referencedTables(c.definition)].sort()).toEqual(c.expected);
    });
    it(`database test: ${c.name}`, () => {
      const line = `select is(public.ref_table_names('${JSON.stringify(c.definition)}'), ${sqlArray(c.expected)}, '${c.name}');`;
      expect(sql).toContain(line);
    });
  }
});
