// Checks that both stores run before they write, so that a person reads the same message on either store.
import { formatDate, isIsoDate, planPublish, type VersionRange } from '../engine/versions';
import { MAX_REF_ROWS, storeError } from './types';

export function checkRange(from: string, to: string | null): void {
  if (!isIsoDate(from)) throw storeError('invalid', 'errors.startNotDate', { value: from });
  if (to !== null && !isIsoDate(to)) throw storeError('invalid', 'errors.endNotDate', { value: to });
  if (to !== null && to < from) {
    throw storeError('invalid', 'errors.endBeforeStart', { end: formatDate(to), start: formatDate(from) });
  }
}

export function checkRowCap(rowCount: number): void {
  if (rowCount > MAX_REF_ROWS) {
    throw storeError('invalid', 'errors.tooManyRows', { max: MAX_REF_ROWS.toLocaleString('en-US'), n: rowCount.toLocaleString('en-US') });
  }
}

/**
 * The new dates of a draft must not share a day with a published version. It asks the question that a publish would ask (same
 * rule 6: a published version with no end that starts earlier is ended the day before), so a draft that can be saved can also be
 * published. A draft never blocks another draft.
 */
export function checkDraftRange(versions: (VersionRange & { status: 'draft' | 'published' })[], versionNo: number, from: string, to: string | null): void {
  const trial = versions.map((v) => (v.versionNo === versionNo ? { ...v, validFrom: from, validTo: to } : v));
  const plan = planPublish(trial, versionNo, 'this version');
  if (!plan.ok && plan.kind === 'overlap') throw storeError('conflict', 'errors.datesOverlap');
}
