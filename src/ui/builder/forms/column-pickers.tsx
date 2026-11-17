import { useState } from 'react';
import { Button, Dropdown, ErrorState, Field, Icon } from '../../components';
import { pickerStrings as t } from '../../strings';
import type { SourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/**
 * One column name. With the columns loaded it is a dropdown of them (a name that is not among them stays selectable, so
 * a saved flow shows what it holds); without them it is a text field, so the form works before any file is chosen.
 */
export function ColumnSelect({ label, value, onChange, columns, disabled, width = 150 }: { label: string; value: string; onChange: (v: string) => void; columns: string[] | null; disabled: boolean; width?: number }) {
  if (columns === null) {
    return <Field label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  const names = value && !columns.includes(value) ? [value, ...columns] : columns;
  return (
    <div>
      <span className={styles.label}>{label}</span>
      <Dropdown label={label} options={[{ value: '', label: t.choose }, ...names.map((n) => ({ value: n, label: n }))]} value={value} disabled={disabled} width={width} onChange={onChange} />
    </div>
  );
}

/** A list of column names as chips with a remove button, and a way to add one (a dropdown when the columns are loaded, else a text field). */
export function ColumnList({ label, values, onChange, columns, disabled }: { label: string; values: string[]; onChange: (v: string[]) => void; columns: string[] | null; disabled: boolean }) {
  const [text, setText] = useState('');
  const add = (name: string): void => {
    const n = name.trim();
    if (n && !values.includes(n)) onChange([...values, n]);
    setText('');
  };
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className={styles.label} style={{ marginBottom: 0 }}>
        {label}
      </span>
      {values.length === 0 ? <p className={styles.hint}>{t.none}</p> : null}
      <div className={styles.chips}>
        {values.map((v) => (
          <span key={v} className={styles.chip}>
            {v}
            <Button compact disabled={disabled} aria-label={t.remove(v, label)} onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="close" />
            </Button>
          </span>
        ))}
      </div>
      {columns !== null ? (
        <Dropdown
          label={t.addTo(label)}
          options={[{ value: '', label: t.addColumn }, ...columns.filter((c) => !values.includes(c)).map((c) => ({ value: c, label: c }))]}
          value=""
          disabled={disabled}
          width={338}
          onChange={(v) => v && add(v)}
        />
      ) : (
        <form
          className={styles.adder}
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <div className={styles.grow}>
            <Field label={t.columnName} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
          </div>
          <Button compact type="submit" disabled={disabled || text.trim() === ''}>
            {t.add}
          </Button>
        </form>
      )}
    </div>
  );
}

/** The button that loads the columns of an input, and what went wrong when it cannot. */
export function LoadColumnsBar({ source, label = t.load }: { source: SourceColumns; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={styles.toolbar}>
        <Button compact busy={source.loading} onClick={() => void source.load()}>
          {source.columns ? t.reload : label}
        </Button>
      </div>
      {source.error ? <ErrorState what={t.loadFailed} next={source.error} /> : null}
    </div>
  );
}
