import { EngineError, type Column } from '../../../engine/types';
import { formatDate, resolveVersion, type RefTable } from '../../../engine/versions';
import { errorText } from '../../i18n';

// What the Configure tab of a Reference table step says about its table (SPEC 13.3 items 5 and 6, DESIGN "Reference table step").

export type ReferenceTableInfo =
  /** No table chosen yet. */
  | { kind: 'none' }
  /** The name is not in the list of tables (the table was deleted, or the flow came from elsewhere). */
  | { kind: 'missing'; name: string }
  /** The table exists but this person cannot read its rows yet: save the flow first (SPEC 12.1). */
  | { kind: 'unreadable'; name: string }
  /** No usable version for the test date, or overlapping versions: `message` says which, in the current language. */
  | { kind: 'no_version'; name: string; message: string; columns: Column[] }
  | { kind: 'ready'; name: string; versionNo: number; range: string; columns: Column[] };

/** "from 1 Jul 2026 to 31 Dec 2026", or "from 1 Jul 2026" for a version with no end. */
export const versionRange = (validFrom: string, validTo: string | null): string => (validTo === null ? `from ${formatDate(validFrom)}` : `from ${formatDate(validFrom)} to ${formatDate(validTo)}`);

/** The columns of the newest version (by number) that this person can read. */
function newestColumns(table: RefTable): Column[] {
  const newest = [...table.versions].sort((a, b) => b.versionNo - a.versionNo)[0];
  return newest ? newest.columns : [];
}

/**
 * The state of the table of a Reference table step on a test date. A draft counts, as it does in a test run of the builder.
 * A table without a readable version is "unreadable", the same rule as the Lookup step (`refTableUnreadable`).
 */
export function referenceTableInfo(tables: RefTable[], name: string, date: string): ReferenceTableInfo {
  if (name === '') return { kind: 'none' };
  const table = tables.find((t) => t.name === name);
  if (!table) return { kind: 'missing', name };
  if (table.versions.length === 0) return { kind: 'unreadable', name };
  try {
    const v = resolveVersion(table.versions, date, { what: `reference table "${name}"`, includeDrafts: true });
    return { kind: 'ready', name, versionNo: v.versionNo, range: versionRange(v.validFrom, v.validTo), columns: v.columns };
  } catch (e) {
    if (e instanceof EngineError) return { kind: 'no_version', name, message: errorText(e), columns: newestColumns(table) };
    throw e;
  }
}
