import { checkRange, checkRowCap } from './checks';
import { storeError } from './types';
import type { DataStore, RefImportInput, RefImportResult } from './types';

type RefMethods = Pick<DataStore, 'createRefTable' | 'createRefTableVersion' | 'saveRefTableVersion'>;

/**
 * An import always makes a draft and never publishes (SPEC 12.1 item 3). It uses the methods of the store that already
 * exist, so the rules of both stores (admin only, no overlap, a published version is read-only, 50,000 rows) stay in one
 * place. Everything that can be checked is checked before the first write, so a refused import creates nothing.
 *
 * The rows of a version are one JSON value in the database, so they are saved in one call, as the grid of the screen
 * does for 50,000 rows (D85). A failure after the draft was created leaves an empty draft that the admin can see.
 */
export async function importRefTable(store: RefMethods, input: RefImportInput): Promise<RefImportResult> {
  const { target, columns, rows } = input;
  checkRowCap(rows.length);
  if (columns.length === 0 || columns.some((c) => c.name.trim() === '')) throw storeError('invalid', 'errors.importColumns');
  if (rows.some((r) => r.length !== columns.length)) throw storeError('invalid', 'errors.importColumns');

  if (target.kind === 'newTable') {
    if (!target.name.trim()) throw storeError('invalid', 'errors.refTableNeedsName');
    const created = await store.createRefTable({ name: target.name, description: target.description, columns });
    const versionNo = created.versions[0]!.versionNo;
    return { table: await store.saveRefTableVersion(created.id, versionNo, { columns, rows }), versionNo };
  }
  if (target.kind === 'newVersion') {
    checkRange(target.validFrom, null);
    const created = await store.createRefTableVersion(target.tableId, { validFrom: target.validFrom });
    const versionNo = Math.max(...created.versions.map((v) => v.versionNo));
    return { table: await store.saveRefTableVersion(target.tableId, versionNo, { columns, rows }), versionNo };
  }
  // The draft keeps its dates; its columns and rows are replaced. A published version is refused by the save.
  return { table: await store.saveRefTableVersion(target.tableId, target.versionNo, { columns, rows }), versionNo: target.versionNo };
}
