// Checks that both stores run before they write, so that a person reads the same message on either store.
import { formatDate, isIsoDate } from '../engine/versions';
import { MAX_REF_ROWS, StoreError } from './types';

export function checkRange(from: string, to: string | null): void {
  if (!isIsoDate(from)) throw new StoreError('invalid', `"${from}" is not a date. Pick a start date in the date picker.`);
  if (to !== null && !isIsoDate(to)) throw new StoreError('invalid', `"${to}" is not a date. Pick an end date or leave it empty.`);
  if (to !== null && to < from) {
    throw new StoreError('invalid', `The end date ${formatDate(to)} is before the start date ${formatDate(from)}. Change one of them.`);
  }
}

export function checkRowCap(rowCount: number): void {
  if (rowCount > MAX_REF_ROWS) {
    throw new StoreError(
      'invalid',
      `A reference table version holds at most ${MAX_REF_ROWS.toLocaleString('en-US')} rows, and this one has ${rowCount.toLocaleString('en-US')}. Remove rows and save again.`,
    );
  }
}
