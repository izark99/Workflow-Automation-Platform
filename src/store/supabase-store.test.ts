import { describe, expect, it } from 'vitest';
import { StoreError } from './types';
import { storeErrorFrom } from './supabase-store';

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
});
