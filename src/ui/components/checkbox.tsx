import type { ReactNode } from 'react';
import styles from './checkbox.module.css';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The visible label. Leave it out for a box inside a grid and give `label` instead. */
  children?: ReactNode;
  /** The accessible name when there is no visible label. */
  label?: string;
  disabled?: boolean;
}

/** A drawn 18 px box on a `role="checkbox"` button. Space (and Enter) toggle it, as the button's own click does. */
export function Checkbox({ checked, onChange, children, label, disabled = false }: CheckboxProps) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} className={styles.checkbox} onClick={() => onChange(!checked)}>
      <span className={styles.box} aria-hidden="true">
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5l2.5 2.5L10 3.5" />
          </svg>
        ) : null}
      </span>
      {children}
    </button>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The visible label, which is also the accessible name. */
  children: ReactNode;
  disabled?: boolean;
}

/**
 * A yes/no control that applies a setting at once (design/harold/components/Switch): a 40 x 24 px track on a
 * `role="switch"` button. A value that is saved later with a Save button is a Checkbox.
 */
export function Switch({ checked, onChange, children, disabled = false }: SwitchProps) {
  return (
    <span className={styles.switch}>
      <button type="button" role="switch" aria-checked={checked} aria-label={typeof children === 'string' ? children : undefined} disabled={disabled} className={styles.track} onClick={() => onChange(!checked)} />
      <span>{children}</span>
    </span>
  );
}
