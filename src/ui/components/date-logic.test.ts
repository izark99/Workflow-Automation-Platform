import { describe, expect, it } from 'vitest';
import { addMonths, dayLabel, monthCells, monthOf, monthTitle, moveDate } from './date-logic';

describe('month grid', () => {
  it('September 2026 starts on a Tuesday, so one blank comes first, and has 30 days', () => {
    const cells = monthCells({ year: 2026, month: 9 });
    expect(cells.slice(0, 2)).toEqual([null, '2026-09-01']);
    expect(cells.filter((c) => c !== null)).toHaveLength(30);
    expect(cells.at(-1)).toBe('2026-09-30');
  });
  it('a month that starts on Monday has no blank; one that starts on Sunday has six', () => {
    expect(monthCells({ year: 2026, month: 6 })[0]).toBe('2026-06-01'); // Mon
    expect(monthCells({ year: 2026, month: 11 }).filter((c) => c === null)).toHaveLength(6); // Sun
  });
  it('February of a leap year has 29 days', () => {
    expect(monthCells({ year: 2028, month: 2 }).filter((c) => c !== null)).toHaveLength(29);
    expect(monthCells({ year: 2026, month: 2 }).filter((c) => c !== null)).toHaveLength(28);
  });
});

describe('labels and months', () => {
  it('titles and day labels', () => {
    expect(monthTitle({ year: 2026, month: 9 })).toBe('September 2026');
    expect(dayLabel('2026-09-01')).toBe('1 September 2026');
  });
  it('addMonths crosses years in both directions', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthOf('2026-09-30')).toEqual({ year: 2026, month: 9 });
  });
});

describe('moveDate', () => {
  it('arrow keys move a day or a week and cross month ends', () => {
    expect(moveDate('2026-09-30', 'ArrowRight')).toBe('2026-10-01');
    expect(moveDate('2026-10-01', 'ArrowLeft')).toBe('2026-09-30');
    expect(moveDate('2026-09-30', 'ArrowDown')).toBe('2026-10-07');
    expect(moveDate('2026-09-03', 'ArrowUp')).toBe('2026-08-27');
  });
  it('Home goes to Monday and End to Sunday of the same week', () => {
    expect(moveDate('2026-09-30', 'Home')).toBe('2026-09-28'); // Wed -> Mon
    expect(moveDate('2026-09-30', 'End')).toBe('2026-10-04'); // Wed -> Sun
    expect(moveDate('2026-09-28', 'Home')).toBe('2026-09-28');
    expect(moveDate('2026-10-04', 'End')).toBe('2026-10-04');
  });
  it('page keys move a month and clamp the day', () => {
    expect(moveDate('2026-10-31', 'PageUp')).toBe('2026-09-30');
    expect(moveDate('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveDate('2026-12-15', 'PageDown')).toBe('2027-01-15');
  });
  it('is not affected by the time zone (UTC arithmetic)', () => {
    expect(moveDate('2026-03-28', 'ArrowRight')).toBe('2026-03-29');
    expect(moveDate('2026-03-29', 'ArrowRight')).toBe('2026-03-30');
  });
});
