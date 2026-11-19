import { createPortal } from 'react-dom';
import { popoverLayer, useFloating } from './floating';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useT, formatDate } from '../i18n';
import { addMonths, dayLabel, monthCells, monthOf, monthTitle, moveDate, weekdays } from './date-logic';
import type { DateKey } from './date-logic';
import { Icon } from './icons';
import { useOutsideClose } from './popover';
import styles from './popover.module.css';

export interface DatePickerProps {
  /** Names the control, for example "Effective date". */
  label: string;
  /** ISO date, `2026-09-30`. */
  value: string;
  onChange: (iso: string) => void;
  /** Pixels, or `'100%'` to fill the space that the parent gives. */
  width?: number | '100%';
  disabled?: boolean;
  /** Starts open, for the components page. */
  defaultOpen?: boolean;
}

const KEYS: DateKey[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];

/** Button showing `30 Sep 2026` and a popover month grid that starts on Monday. Opens upward when there is no room below. */
export function DatePicker({ label, value, onChange, width = 180, disabled = false, defaultOpen = false }: DatePickerProps) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const skipFocus = useRef(defaultOpen);
  const [focused, setFocused] = useState(value);
  const [shown, setShown] = useState(() => monthOf(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  const popRef = useRef<HTMLDivElement>(null);
  const floating = useFloating(rootRef, popRef, open);
  useOutsideClose([rootRef, popRef], open, () => close(false));

  // Focus the focused day after every move.
  useEffect(() => {
    if (skipFocus.current) {
      skipFocus.current = false; // a picker that starts open must not take focus from the page
      return;
    }
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus();
  }, [open, focused, shown]);

  const show = (iso: string): void => {
    setFocused(iso);
    setShown(monthOf(iso));
  };
  const openPicker = (): void => {
    show(value);
    setOpen(true);
  };
  const pick = (iso: string): void => {
    onChange(iso);
    close(true);
  };
  const step = (delta: number): void => {
    const next = addMonths(shown, delta);
    setShown(next);
    setFocused(`${String(next.year).padStart(4, '0')}-${String(next.month).padStart(2, '0')}-01`);
  };

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if ((KEYS as string[]).includes(e.key) && (e.target as HTMLElement).dataset.iso) {
      e.preventDefault();
      show(moveDate(focused, e.key as DateKey));
    }
  };

  return (
    <div className={styles.anchor} ref={rootRef} style={width === '100%' ? { display: 'block' } : undefined}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        style={{ width }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={t('common.datePicker.change', { label, date: formatDate(value) })}
        disabled={disabled}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <Icon name="calendar" />
        {formatDate(value)}
      </button>
      {open && popoverLayer()
        ? createPortal(
        <div
          id={dialogId}
          ref={popRef}
          role="dialog"
          aria-label={t('common.datePicker.choose', { label: label.toLowerCase() })}
          className={`${styles.popover} ${styles.calendar}`}
          style={floating.style}
          onKeyDown={onKey}
        >
          <div className={styles.monthRow}>
            <button type="button" className={styles.nav} aria-label={t('common.datePicker.previousMonth')} onClick={() => step(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <span style={{ fontWeight: 700 }} aria-live="polite">
              {monthTitle(shown)}
            </span>
            <button type="button" className={styles.nav} aria-label={t('common.datePicker.nextMonth')} onClick={() => step(1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          <div className={styles.grid} ref={gridRef}>
            {weekdays().map((d) => (
              <span key={d} className={styles.weekday} aria-hidden="true">
                {d}
              </span>
            ))}
            {monthCells(shown).map((iso, i) =>
              iso === null ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={iso}
                  type="button"
                  data-iso={iso}
                  className={styles.day}
                  aria-label={dayLabel(iso)}
                  aria-pressed={iso === value}
                  tabIndex={iso === focused ? 0 : -1}
                  onClick={() => pick(iso)}
                >
                  {Number(iso.slice(8))}
                </button>
              ),
            )}
          </div>
        </div>,
        popoverLayer()!,
      )
        : null}
    </div>
  );
}
