import { useState } from 'react';
import { Button, Dropdown, ErrorState, Field, Icon, InfoTip } from '../../components';
import { useT } from '../../i18n';
import type { SourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** A label with an optional info button after it: the place where the explanation of a setting lives. */
export function SectionLabel({ label, hint, flush = false }: { label: string; hint?: string; flush?: boolean }) {
  return (
    <span className={styles.labelRow} style={flush ? { marginBottom: 0 } : undefined}>
      <span className={styles.labelText}>{label}</span>
      {hint ? <InfoTip label={label}>{hint}</InfoTip> : null}
    </span>
  );
}

/**
 * One column name. With the columns loaded it is a dropdown of them (a name that is not among them stays selectable, so
 * a saved flow shows what it holds); without them it is a text field, so the form works before any file is chosen.
 */
export function ColumnSelect({ label, hint, value, onChange, columns, disabled, width = 150 }: { label: string; hint?: string; value: string; onChange: (v: string) => void; columns: string[] | null; disabled: boolean; width?: number }) {
  const t = useT();
  if (columns === null) {
    return <Field label={label} hint={hint} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  const names = value && !columns.includes(value) ? [value, ...columns] : columns;
  return (
    <div>
      <SectionLabel label={label} hint={hint} />
      <Dropdown label={label} options={[{ value: '', label: t('builder.picker.choose') }, ...names.map((n) => ({ value: n, label: n }))]} value={value} disabled={disabled} width={width} onChange={onChange} />
    </div>
  );
}

/** A list of column names as chips with a remove button, and a way to add one (a dropdown when the columns are loaded, else a text field). */
export function ColumnList({ label, hint, values, onChange, columns, disabled }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; columns: string[] | null; disabled: boolean }) {
  const t = useT();
  const [text, setText] = useState('');
  const add = (name: string): void => {
    const n = name.trim();
    if (n && !values.includes(n)) onChange([...values, n]);
    setText('');
  };
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel label={label} hint={hint} flush />
      {values.length === 0 ? <p className={styles.note}>{t('builder.picker.none')}</p> : null}
      <div className={styles.chips}>
        {values.map((v) => (
          <span key={v} className={styles.chip}>
            <span data-user-content>{v}</span>
            <Button compact disabled={disabled} aria-label={t('builder.picker.remove', { name: v, label })} onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="close" />
            </Button>
          </span>
        ))}
      </div>
      {columns !== null ? (
        <Dropdown
          label={t('builder.picker.addTo', { label })}
          options={[{ value: '', label: t('builder.picker.addColumn') }, ...columns.filter((c) => !values.includes(c)).map((c) => ({ value: c, label: c }))]}
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
            <Field label={t('builder.picker.columnName')} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
          </div>
          <Button compact type="submit" disabled={disabled || text.trim() === ''}>
            {t('builder.picker.add')}
          </Button>
        </form>
      )}
    </div>
  );
}

/** The button that loads the columns of an input, and what went wrong when it cannot. */
export function LoadColumnsBar({ source, label }: { source: SourceColumns; label?: string }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={styles.toolbar}>
        <Button compact busy={source.loading} onClick={() => void source.load()}>
          {source.columns ? t('builder.picker.reload') : label ?? t('builder.picker.load')}
        </Button>
      </div>
      {source.error ? <ErrorState what={t('builder.picker.loadFailed')} next={source.error} /> : null}
    </div>
  );
}
