// Which data store the app uses (decision D64). Both variables set: Supabase. Neither: the local store,
// which is what the dev server, the e2e tests and the UI-rules tests use.
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function supabaseConfigFrom(env: Record<string, unknown>): SupabaseConfig | null {
  const url = text(env.VITE_SUPABASE_URL);
  const anonKey = text(env.VITE_SUPABASE_ANON_KEY);
  if (!url && !anonKey) return null;
  const missing = !url ? 'VITE_SUPABASE_URL' : !anonKey ? 'VITE_SUPABASE_ANON_KEY' : '';
  if (missing) {
    throw new Error(
      `${missing} is missing. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the server, or neither to use the local data store.`,
    );
  }
  return { url, anonKey };
}
