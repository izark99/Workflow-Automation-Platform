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
  /** The label is the user's own text (a name they typed), which is never translated. */
  userLabel?: boolean;
  /** A unit or a short word at the end of the box, inside it (for example `days`). */
  suffix?: string;
}

/** A labelled text field. The label and error are tied to the input for screen readers; the hint is an info button after the label. */
export function Field({ label, hint, error, secret = false, userLabel = false, suffix, ...rest }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={id} data-user-content={userLabel ? '' : undefined}>
            {label}
          </label>
          {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
        </div>
        <div className={styles.control} data-invalid={error ? 'true' : undefined} data-disabled={rest.disabled ? 'true' : undefined}>
          <input {...rest} id={id} type={secret ? 'password' : 'text'} className={styles.input} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} />
          {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
        </div>
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** The error of a field: the icon and the words (an error is never colour alone). It replaces the note under the field. */
function FieldError({ id, children }: { id?: string; children: string }) {
  return (
    <span id={id} className={styles.error} role="alert">
      <Icon name="circle-alert" />
      {children}
    </span>
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
  /** A quiet guide, not an error and not a success: for example what to write in a field that is still empty. */
  note?: string;
  mono?: boolean;
  /** What is typed is the user's own text (a list of names), which is never translated. */
  userContent?: boolean;
  /** For code that moves the caret, such as inserting a function at the cursor. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/** A labelled multi-line text field. It cannot be resized by the user. The hint is an info button after the label. */
export function TextAreaField({ label, hint, error, status, note, mono = false, userContent = false, rows = 4, textareaRef, ...rest }: TextAreaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const describedBy = error || status || note ? noteId : undefined;
  return (
    <div>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={id}>
            {label}
          </label>
          {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
        </div>
        <textarea data-user-content={userContent ? '' : undefined} {...rest} ref={textareaRef} id={id} rows={rows} className={`${styles.textarea} ${mono ? styles.mono : ''}`} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
      </div>
      <span id={noteId}>
        {error ? <FieldError>{error}</FieldError> : null}
        {note && !error && !status ? (
          <span className={styles.note} style={{ display: 'block' }}>
            {note}
          </span>
        ) : null}
        {status && !error ? (
          <span className={styles.ok} role="status">
            <Icon name="circle-check" />
            {status}
          </span>
        ) : null}
      </span>
    </div>
  );
}
