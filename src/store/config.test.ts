import { describe, expect, it } from 'vitest';
import { supabaseConfigFrom } from './config';

describe('supabaseConfigFrom', () => {
  it('is null when neither variable is set, so the local store is used', () => {
    expect(supabaseConfigFrom({})).toBeNull();
    expect(supabaseConfigFrom({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })).toBeNull();
    expect(supabaseConfigFrom({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: undefined })).toBeNull();
  });

  it('returns the url and key when both are set, trimmed', () => {
    expect(supabaseConfigFrom({ VITE_SUPABASE_URL: ' http://127.0.0.1:54321 ', VITE_SUPABASE_ANON_KEY: ' key ' })).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'key',
    });
  });

  it('refuses a half configuration and says which variable is missing', () => {
    expect(() => supabaseConfigFrom({ VITE_SUPABASE_URL: 'http://x' })).toThrowError(
      'VITE_SUPABASE_ANON_KEY is missing. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the server, or neither to use the local data store.',
    );
    expect(() => supabaseConfigFrom({ VITE_SUPABASE_ANON_KEY: 'k' })).toThrowError(
      'VITE_SUPABASE_URL is missing. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the server, or neither to use the local data store.',
    );
  });

  it('ignores values that are not text', () => {
    expect(supabaseConfigFrom({ VITE_SUPABASE_URL: true, VITE_SUPABASE_ANON_KEY: 1 })).toBeNull();
  });
});
