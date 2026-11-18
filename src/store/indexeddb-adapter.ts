import type { PersistenceAdapter, Snapshot } from './local-store';

const DB = 'data-flow-webapp';
const STORE = 'snapshot';
const KEY = 'v1';

/**
 * Keeps the snapshot in IndexedDB, not localStorage: one reference table version can hold 50,000 rows, which does not
 * fit the 5 MB of localStorage (decision D37). The whole snapshot is one record; it is small for about ten users' flows.
 */
export class IndexedDbAdapter implements PersistenceAdapter {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('The browser could not open its local storage. Allow site data for this page and reload.'));
    });
  }

  private async run<T>(mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = make(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('The browser could not save your data. Free some disk space, then try again.'));
      });
    } finally {
      db.close();
    }
  }

  async load(): Promise<Snapshot | null> {
    return ((await this.run('readonly', (s) => s.get(KEY))) as Snapshot | undefined) ?? null;
  }

  async save(snapshot: Snapshot): Promise<void> {
    await this.run('readwrite', (s) => s.put(snapshot, KEY));
  }
}
