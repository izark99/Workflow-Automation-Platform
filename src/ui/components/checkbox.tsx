import type { ReactNode } from 'react';
import styles from './checkbox.module.css';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}

/** A drawn box on a `role="checkbox"` button. Space (and Enter) toggle it, as the button's own click does. */
export function Checkbox({ checked, onChange, children, disabled = false }: CheckboxProps) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={styles.checkbox} onClick={() => onChange(!checked)}>
      <svg className={styles.box} aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <rect x="1" y="1" width="18" height="18" rx="5" />
        {checked ? <path d="M5.5 10.5l3 3 6-7" /> : null}
      </svg>
      {children}
    </button>
  );
}
