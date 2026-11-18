// Pure date helpers for the Date picker. Dates are ISO strings (`2026-09-30`); all arithmetic is in UTC so the
// browser time zone cannot move a day.
import { translate } from '../i18n';
import type { MessageKey } from '../i18n';

const monthName = (month: number): string => translate(`common.month.${month}` as MessageKey);

/** The two-letter weekday names, Monday first, from the catalog. */
export const weekdays = (): string[] => [1, 2, 3, 4, 5, 6, 7].map((i) => translate(`common.weekday.${i}` as MessageKey));

export interface YearMonth {
  year: number;
  month: number; // 1 to 12
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export const toIso = (d: Date): string => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function fromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`"${iso}" is not an ISO date like 2026-09-30.`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export const monthOf = (iso: string): YearMonth => {
  const d = fromIso(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

export const monthTitle = ({ year, month }: YearMonth): string => translate('common.datePicker.monthTitle', { month: monthName(month), year });

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The label a day button carries: `1 September 2026`. */
export function dayLabel(iso: string): string {
  const d = fromIso(iso);
  return translate('common.datePicker.dayLabel', { day: d.getUTCDate(), month: monthName(d.getUTCMonth() + 1), year: d.getUTCFullYear() });
}

/** Cells of the month grid, Monday first: leading blanks (null), then every day of the month as an ISO string. */
export function monthCells({ year, month }: YearMonth): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
  return cells;
}

export type DateKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'PageUp' | 'PageDown' | 'Home' | 'End';

/** Where a key moves the focused day. Page keys move a month and keep the day number when the month has it. */
export function moveDate(iso: string, key: DateKey): string {
  const d = fromIso(iso);
  const day = d.getUTCDate();
  switch (key) {
    case 'ArrowLeft':
      return toIso(new Date(d.getTime() - 86_400_000));
    case 'ArrowRight':
      return toIso(new Date(d.getTime() + 86_400_000));
    case 'ArrowUp':
      return toIso(new Date(d.getTime() - 7 * 86_400_000));
    case 'ArrowDown':
      return toIso(new Date(d.getTime() + 7 * 86_400_000));
    case 'Home':
      return toIso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000));
    case 'End':
      return toIso(new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * 86_400_000));
    case 'PageUp':
    case 'PageDown': {
      const target = addMonths(monthOf(iso), key === 'PageUp' ? -1 : 1);
      const last = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate();
      return `${pad(target.year, 4)}-${pad(target.month)}-${pad(Math.min(day, last))}`;
    }
  }
}
