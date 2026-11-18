// Checks that both stores run before they write, so that a person reads the same message on either store.
import { formatDate, isIsoDate } from '../engine/versions';
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
