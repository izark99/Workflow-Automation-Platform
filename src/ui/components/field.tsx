import { useId } from 'react';
import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';
import { Icon } from './icons';
import { InfoTip } from './info-tip';
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

/** A labelled text field. The label and error are tied to the input for screen readers; the hint is an info button after the label. */
export function Field({ label, hint, error, secret = false, ...rest }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={id}>
            {label}
          </label>
          {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
        </div>
        <input {...rest} id={id} type={secret ? 'password' : 'text'} className={styles.input} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} />
      </div>
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

/** A labelled multi-line text field. It cannot be resized by the user. The hint is an info button after the label. */
export function TextAreaField({ label, hint, error, status, mono = false, rows = 4, textareaRef, ...rest }: TextAreaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const describedBy = error || status ? noteId : undefined;
  return (
    <div>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={id}>
            {label}
          </label>
          {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
        </div>
        <textarea {...rest} ref={textareaRef} id={id} rows={rows} className={`${styles.textarea} ${mono ? styles.mono : ''}`} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
      </div>
      <span id={noteId}>
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
