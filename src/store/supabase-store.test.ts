import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORE_MESSAGES } from './messages';
import { noticesFromRows, refTableFromRow } from './supabase-mapping';
import { StoreError } from './types';
import { storeErrorFrom } from './supabase-store';
import { storeText } from './messages';

describe('storeErrorFrom', () => {
  it('maps a permission error to forbidden', () => {
    const e = storeErrorFrom({ code: '42501', message: 'new row violates row-level security policy' }, 'save the flow');
    expect(e).toBeInstanceOf(StoreError);
    expect(e.code).toBe('forbidden');
    expect(e.message).toBe('You are not allowed to save the flow. Ask the admin if you need this right.');
  });

  it('maps an overlap to conflict and a check failure to invalid', () => {
    expect(storeErrorFrom({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }, 'publish').code).toBe('conflict');
    expect(storeErrorFrom({ code: '23514', message: 'check constraint' }, 'save').code).toBe('invalid');
  });

  it('says in plain words that an overlap or a duplicate was refused', () => {
    const overlap = storeErrorFrom({ code: '23P01', message: 'conflicting key value violates exclusion constraint "flow_versions_no_overlap"' }, 'publish the version');
    expect(overlap.code).toBe('conflict');
    expect(overlap.message).toBe('These dates overlap another published version. Change the valid-from or valid-to date so the ranges do not share a day.');
    const duplicate = storeErrorFrom({ code: '23505', message: 'duplicate key value violates unique constraint "groups_name_key"' }, 'save the group');
    expect(duplicate.code).toBe('conflict');
    expect(duplicate.message).toBe('Could not save the group: that name or email is already used. Use another one and try again.');
  });

  it('keeps the message of an input check the database wrote itself (22023)', () => {
    const e = storeErrorFrom({ code: '22023', message: 'A flow needs a name. Type a name and try again.' }, 'create the flow');
    expect(e.code).toBe('invalid');
    expect(e.message).toBe('A flow needs a name. Type a name and try again.');
  });

  it('maps "nothing found" to not_found', () => {
    expect(storeErrorFrom({ code: 'P0002', message: 'This flow does not exist' }, 'delete').code).toBe('not_found');
    expect(storeErrorFrom({ code: 'PGRST116', message: 'no rows' }, 'open').code).toBe('not_found');
  });

  it('keeps the database message of a rule it raised itself (P0001) and names the action otherwise', () => {
    const own = storeErrorFrom({ code: 'P0001', message: 'Version 1 is published and read-only. Create a new version copied from it.' }, 'save');
    expect(own.code).toBe('conflict');
    expect(own.message).toBe('Version 1 is published and read-only. Create a new version copied from it.');
    const other = storeErrorFrom({ code: '08006', message: 'connection failure' }, 'load the flows');
    expect(other.code).toBe('invalid');
    expect(other.message).toBe('Could not load the flows: connection failure. Check the connection and try again.');
  });

  it('keeps the message of a table that is in use (P0001), the same words as the local store', () => {
    const fromDatabase = 'The reference table "Limits" is read by Alpha, Zeta. Remove it from those flows first, then delete it.';
    const e = storeErrorFrom({ code: 'P0001', message: fromDatabase }, 'delete the table');
    expect(e.code).toBe('conflict');
    expect(e.message).toBe(fromDatabase);
    expect(storeText('errors.refTableInUse', { name: 'Limits', flows: 'Alpha, Zeta' })).toBe(fromDatabase);
  });
});

// Migration 21 says the same words as the local store (SPEC 16.2, T9.11): a template of the store, with each `{name}` written as `%`, is a
// string of the migration. A change of a word in one place fails here until the other follows.
describe('the refusals of linked tables: the words of the database and of the store', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261118000021_ref_table_links.sql', import.meta.url), 'utf8');
  const ids = Object.keys(STORE_MESSAGES).filter((k) => k.startsWith('errors.refLink'));
  it('has the ten messages of the link', () => expect(ids).toHaveLength(10));
  for (const id of ids) {
    it(`${id} is a message of the migration`, () => {
      const template = STORE_MESSAGES[id as keyof typeof STORE_MESSAGES].replace(/\{[a-zA-Z]+\}/g, '%');
      expect(sql).toContain(template);
    });
  }
  it('keeps the kind of the refusal: an input is invalid (22023), a conflict with other tables is a conflict (P0001)', () => {
    expect(storeErrorFrom({ code: '22023', message: 'x' }, 'link the table').code).toBe('invalid');
    expect(storeErrorFrom({ code: 'P0001', message: 'This link would make a cycle: B → A → B. Choose another table, or unlink one of these tables first.' }, 'link the table').code).toBe('conflict');
    expect(storeErrorFrom({ code: 'P0002', message: 'Only an admin can link reference tables. Ask the admin.' }, 'link the table').code).toBe('not_found');
  });
});

describe('the link and the notices from the rows of the database', () => {
  it('a table row with the three parts of a link has a link; one without has none', () => {
    const row = { id: 't1', name: 'Costs', description: '', link_table_id: 'a1', link_column: 'dept', key_column: 'dept', ref_table_versions: [] };
    expect(refTableFromRow(row).link).toEqual({ tableId: 'a1', column: 'dept', keyColumn: 'dept' });
    expect(refTableFromRow({ ...row, link_table_id: null, link_column: null, key_column: null }).link).toBeUndefined();
  });
  it('a notice has the names of its two tables; one whose table is gone is left out', () => {
    const names = new Map([['t1', 'Costs'], ['a1', 'Departments']]);
    const rows = [
      { id: 'n1', ref_table_id: 't1', source_table_id: 'a1', link_column: 'dept', draft_version_no: 3, new_values: ['Kho', 'QA'], created_at: '2026-11-17T08:00:00Z' },
      { id: 'n2', ref_table_id: 'gone', source_table_id: 'a1', link_column: 'dept', draft_version_no: 1, new_values: ['x'], created_at: '2026-11-17T08:00:00Z' },
    ];
    expect(noticesFromRows(rows, names)).toEqual([{ id: 'n1', tableId: 't1', tableName: 'Costs', sourceTableId: 'a1', sourceName: 'Departments', column: 'dept', draftVersionNo: 3, values: ['Kho', 'QA'], createdAt: '2026-11-17T08:00:00Z' }]);
  });
});
