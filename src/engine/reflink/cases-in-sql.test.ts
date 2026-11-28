import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The cases of `supabase/tests/ref-link-cases.json` are written out in the database test of migration 21, each with its name as the
// name of the test. This keeps the two lists equal: a case that is added to the file must be written in the SQL test too.
const cases = JSON.parse(readFileSync(new URL('../../../supabase/tests/ref-link-cases.json', import.meta.url), 'utf8')) as Record<string, { name: string }[]>;
const sql = readFileSync(new URL('../../../supabase/tests/database/210-ref-links.test.sql', import.meta.url), 'utf8');
const prefix: Record<string, string> = {
  distinct: 'distinct values: ',
  newValues: 'new values: ',
  draftStart: 'start of the draft: ',
  versionInEffect: 'version in effect: ',
  linkRefusal: 'link: ',
  publishRefusal: 'publish of A: ',
  deleteRefusal: 'delete: ',
};

describe('the shared cases are in the database test', () => {
  for (const [kind, list] of Object.entries(cases)) {
    for (const c of list) {
      it(`${kind}: ${c.name}`, () => {
        expect(sql).toContain(`'${(prefix[kind] + c.name).replaceAll("'", "''")}'`);
      });
    }
  }
});
