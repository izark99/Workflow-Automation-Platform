import { IndexedDbAdapter } from './indexeddb-adapter';
import { LocalStore } from './local-store';
import type { Snapshot } from './local-store';
import { seedSnapshot } from './seed';

export type { DataStore } from './types';
export * from './types';
export { LocalStore, MemoryAdapter } from './local-store';

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
