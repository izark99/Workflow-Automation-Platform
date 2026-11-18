import { useId } from 'react';
import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';
import { Icon } from './icons';
import styles from './field.module.css';

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style' | 'id'>;

export interface FieldProps extends TextProps {
  label: string;
  hint?: string;
  /** An error says what failed and what to do next. */
  error?: string;
  /** Hides what is typed (a password). */
  secret?: boolean;
}

/** A labelled text field. The label, hint and error are tied to the input for screen readers. */
export function Field({ label, hint, error, secret = false, ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
        <input {...rest} id={id} type={secret ? 'password' : 'text'} className={styles.input} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
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

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style' | 'id'> {
  label: string;
  hint?: string;
  /** What failed and what to do next. */
  error?: string;
  /** A positive message, announced politely (for example "Formula is valid"). */
  status?: string;
  mono?: boolean;
  /** For code that moves the caret, such as inserting a function at the cursor. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/** A labelled multi-line text field. It cannot be resized by the user. */
export function TextAreaField({ label, hint, error, status, mono = false, rows = 4, textareaRef, ...rest }: TextAreaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const describedBy = hint || error || status ? noteId : undefined;
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
        <textarea {...rest} ref={textareaRef} id={id} rows={rows} className={`${styles.textarea} ${mono ? styles.mono : ''}`} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
      </label>
      <span id={noteId}>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
        {error ? (
          <span className={styles.error} role="alert" style={{ display: 'block' }}>
            {error}
          </span>
        ) : null}
        {status && !error ? (
          <span className={styles.ok} role="status" style={{ display: 'block' }}>
            {status}
          </span>
        ) : null}
      </span>
    </div>
  );
}
