import { translate } from './catalog';
import type { MessageKey } from './catalog';

/** `30 Sep 2026`: the form of every date in the UI, with the month name from the catalog (SPEC 11.3, point 6). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${translate(`common.monthShort.${Number(m[2])}` as MessageKey)} ${m[1]}` : iso;
}
