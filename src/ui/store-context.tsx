import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DataStore } from '../store/types';

const StoreContext = createContext<DataStore | null>(null);

export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): DataStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore needs a StoreProvider above it.');
  return store;
}

export interface Loaded<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Runs the load again and keeps the old data on screen meanwhile. */
  reload: () => void;
}

/** Loads data from the store when the screen opens and when `reload` is called. */
export function useLoad<T>(load: (store: DataStore) => Promise<T>): Loaded<T> {
  const store = useStore();
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let live = true;
    loadRef.current(store).then(
      (data) => live && setState({ data, loading: false }),
      (e: unknown) => live && setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)), loading: false })),
    );
    return () => {
      live = false;
    };
  }, [store, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
