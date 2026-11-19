import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';
import { isTypeAheadKey, moveIndex, typeAhead } from './list-keys';
import type { ListKey } from './list-keys';
import { opensUp, useOutsideClose } from './popover';
import styles from './popover.module.css';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  /** Names the control for assistive technology, for example "Version". The selected label is appended. */
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /** Pixels, or `'100%'` to fill the space that the parent gives (a card whose width changes with a scroll bar). */
  width?: number | '100%';
  disabled?: boolean;
  /** Starts open, for the components page. */
  defaultOpen?: boolean;
  /** A menu: the button always shows this text (the options are actions) and `label` names it for assistive technology. */
  buttonLabel?: string;
  /** A 36 px button, for a table row. */
  compact?: boolean;
  /** The options are the user's own texts (names they typed), which are never translated. */
  userContent?: boolean;
}

/** Button with a chevron and a popover list. Arrow keys, Home, End, Enter, Space, Escape and type-ahead. */
export function Dropdown({ label, options, value, onChange, width = 260, disabled = false, defaultOpen = false, buttonLabel, compact = false, userContent = false }: DropdownProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(() => (defaultOpen ? Math.max(0, options.findIndex((o) => o.value === value)) : -1));
  const skipFocus = useRef(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typed = useRef({ text: '', timer: 0 });
  const listId = useId();
  const selected = options.findIndex((o) => o.value === value);
  const [up, setUp] = useState(false);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  useOutsideClose(rootRef, open, () => close(false));

  useEffect(() => {
    if (skipFocus.current) {
      skipFocus.current = false; // an option that starts open must not take focus from the page
      return;
    }
    if (open && active >= 0) optionRefs.current[active]?.focus();
  }, [open, active]);

  const openList = (): void => {
    setUp(opensUp(rootRef.current, options.length * 38 + 12));
    setActive(selected >= 0 ? selected : 0);
    setOpen(true);
  };
  const choose = (i: number): void => {
    const option = options[i];
    if (option) onChange(option.value);
    close(true);
  };

  const onTriggerKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive((a) => moveIndex(a, options.length, e.key as ListKey));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (isTypeAheadKey(e)) {
      window.clearTimeout(typed.current.timer);
      typed.current.text += e.key;
      typed.current.timer = window.setTimeout(() => (typed.current.text = ''), 700);
      const hit = typeAhead(options.map((o) => o.label), active, typed.current.text);
      if (hit >= 0) setActive(hit);
    }
  };

  const current = options[selected]?.label ?? '';
  return (
    <div className={styles.anchor} ref={rootRef} style={width === '100%' ? { display: 'block' } : undefined}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${styles.between} ${compact ? styles.compactTrigger : ''}`}
        style={{ width }}
        data-user-content={userContent ? '' : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={buttonLabel === undefined ? `${label}: ${current}` : label}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
      >
        {buttonLabel ?? current}
        <Icon name="chevronDown" />
      </button>
      {open ? (
        <div id={listId} role="listbox" aria-label={label} className={`${styles.popover} ${up ? styles.up : ''}`} style={{ width: width === '100%' ? 'calc(100% + 20px)' : width + 20 }} onKeyDown={onListKey}>
          {options.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={i === selected}
              tabIndex={i === active ? 0 : -1}
              className={styles.option}
              data-user-content={userContent ? '' : undefined}
              onClick={() => choose(i)}
            >
              {i === selected ? <Icon name="check" /> : <span className={styles.check} />}
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
