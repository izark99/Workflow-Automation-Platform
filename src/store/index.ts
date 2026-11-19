import { createClient } from '@supabase/supabase-js';
import { LocalAccountAdmin, SupabaseAccountAdmin } from './accounts';
import type { AccountAdmin } from './accounts';
import { MemoryAuth, type AuthService } from './auth';
import { supabaseConfigFrom } from './config';
import { IndexedDbAdapter } from './indexeddb-adapter';
import { LocalStore } from './local-store';
import type { Snapshot } from './local-store';
import { seedSnapshot } from './seed';
import { SupabaseAuth } from './supabase-auth';
import { SupabaseStore } from './supabase-store';
import type { DataStore } from './types';

export type { DataStore } from './types';
export * from './types';
export { LocalStore, MemoryAdapter } from './local-store';
export { SupabaseStore } from './supabase-store';
export { SupabaseAuth } from './supabase-auth';
export * from './auth';
export * from './accounts';

const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The store the app uses. In the dev and test builds two localStorage keys steer it (decision D37):
 * `dfw.seed` holds a snapshot to start from (the e2e tests bring the real timesheet flow and tables this way) and
 * `dfw.loadDelayMs` delays every call (the UI rules need it to see the skeleton).
 */
export function createLocalStore(): LocalStore {
  return new LocalStore({
    adapter: new IndexedDbAdapter(),
    seed: () => {
      const injected = DEV_TOOLS ? readKey('dfw.seed') : null;
      return injected ? (JSON.parse(injected) as Snapshot) : seedSnapshot();
    },
    delayMs: () => (DEV_TOOLS ? Number(readKey('dfw.loadDelayMs') ?? 0) || 0 : 0),
  });
}

/** The store and, when there is a server, the sign-in service the app runs on. */
export interface Backend {
  store: DataStore;
  /** Null on the local store: nobody signs in there. */
  auth: AuthService | null;
  /** Account management by the admin: the Edge Function on Supabase, the snapshot on the local store. */
  accounts: AccountAdmin;
}

/**
 * Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are both set, the local store otherwise. The anon key is
 * meant for the browser; row-level security protects the data, not the key. In the dev and test builds the local store can
 * be given a stand-in sign-in with the localStorage key `dfw.auth` (a JSON list of {email, password}); then the app shows
 * the sign-in screen, and `window.dfwAuth.expire()` ends the session (decision D67).
 */
export function createBackend(): Backend {
  const config = supabaseConfigFrom(import.meta.env as Record<string, unknown>);
  if (config) {
    const client = createClient(config.url, config.anonKey);
    return { store: new SupabaseStore(client), auth: new SupabaseAuth(client), accounts: new SupabaseAccountAdmin(client) };
  }
  const store = createLocalStore();
  // The dev and test builds expose the local store, so a test can lock the signed-in account while the app is open.
  if (DEV_TOOLS) (window as unknown as { dfwStore?: LocalStore }).dfwStore = store;
  const injected = DEV_TOOLS ? readKey('dfw.auth') : null;
  if (!injected) return { store, auth: null, accounts: new LocalAccountAdmin(store) };
  const auth = new MemoryAuth({ users: JSON.parse(injected) as { email: string; password: string }[], storage: localStorage });
  (window as unknown as { dfwAuth?: MemoryAuth }).dfwAuth = auth;
  return { store, auth, accounts: new LocalAccountAdmin(store, auth) };
}

export const createDataStore = (): DataStore => createBackend().store;
