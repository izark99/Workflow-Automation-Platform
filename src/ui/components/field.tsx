import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Icon } from './icons';
import styles from './field.module.css';

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style' | 'id'>;

export interface FieldProps extends TextProps {
  label: string;
  hint?: string;
  /** An error says what failed and what to do next. */
  error?: string;
}

/** A labelled text field. The label, hint and error are tied to the input for screen readers. */
export function Field({ label, hint, error, ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
        <input {...rest} id={id} type="text" className={styles.input} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
      </label>
      {hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Text input with a search icon inside. It is `type="text"`, so the browser draws no clear button. */
export function SearchField({ label, ...rest }: TextProps & { label: string }) {
  return (
    <label className={styles.search}>
      <Icon name="search" />
      <input {...rest} type="text" className={styles.searchInput} aria-label={label} />
    </label>
  );
}
