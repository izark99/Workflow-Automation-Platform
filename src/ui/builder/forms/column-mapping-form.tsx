import { useState } from 'react';
import { Button, Checkbox, Dialog, Dropdown, ErrorState, Field, Icon, TextAreaField } from '../../components';
import { useT, errorText } from '../../i18n';
import { todayIso } from '../../screens/flows-logic';
import { COLUMN_TYPES, emptyRow, looksLikeGrid, mergeColumns, parsePaste, rowsFromSettings, settingsFromRows } from './column-mapping-logic';
import type { MappingRow } from './column-mapping-logic';
import { loadSourceColumns } from './load-columns';
import type { FormProps } from './types';
import { SectionLabel } from './column-pickers';
import styles from './column-mapping-form.module.css';


/** Column mapping: one row for each column to keep, rename or retype. Accepts a paste from Excel and can load the columns from a test file. */
export function ColumnMappingForm({ step, definition, onSettings, readOnly, context }: FormProps) {
  const t = useT();
  const TYPE_OPTIONS = [{ value: '', label: t('builder.form.mapping.asIs') }, ...COLUMN_TYPES.map((c) => ({ value: c, label: c }))];
  const [rows, setRows] = useState<MappingRow[]>(() => rowsFromSettings(step.settings));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const apply = (next: MappingRow[]): void => {
    setRows(next);
    const r = settingsFromRows(next, step.settings);
    setError(r.error ?? null);
    if (r.settings) onSettings(r.settings);
  };
  const patch = (i: number, change: Partial<MappingRow>): void => apply(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));

  const applyPaste = (text: string): string | null => {
    const r = parsePaste(text);
    if (!r.ok) return r.message;
    apply(r.rows);
    setInfo(t('builder.form.mapping.pasted', { n: r.rows.length }));
    return null;
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    setInfo(null);
    try {
      const names = (await loadSourceColumns(definition, step, context.testFiles, context.refTables, todayIso(), undefined, context.parameterValues)).map((c) => c.name);
      const merged = mergeColumns(rows, names);
      apply(merged.rows);
      setError(null);
      setInfo(merged.added === 0 ? t('builder.form.mapping.loadedNone') : t('builder.form.mapping.loaded', { n: merged.added }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.form}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text/plain');
        if (readOnly || !looksLikeGrid(text)) return; // a single value pastes into its own field as usual
        e.preventDefault();
        const message = applyPaste(text);
        setError(message ? `${t('builder.form.mapping.pasteFailed')} ${message}` : null);
      }}
    >
      <SectionLabel label={t('builder.form.mapping.list')} hint={t('builder.form.mapping.hint')} />
      <div className={styles.toolbar}>
        <Button compact disabled={readOnly || loading} busy={loading} onClick={() => void load()}>
          {t('builder.form.mapping.load')}
        </Button>
        <Button compact disabled={readOnly} onClick={() => { setPasteText(''); setPasteError(null); setPasteOpen(true); }}>
          {t('builder.form.mapping.paste')}
        </Button>
        <Button compact disabled={readOnly} onClick={() => apply([...rows, emptyRow()])}>
          {t('builder.form.mapping.add')}
        </Button>
      </div>
      {error ? <ErrorState what={t('builder.form.mapping.loadFailed')} next={error} /> : null}
      {info ? (
        <p className={styles.note} role="status">
          {info}
        </p>
      ) : null}
      {rows.length === 0 ? <p className={styles.note}>{t('builder.form.mapping.empty')}</p> : null}
      <ul className={styles.rows} aria-label={t('builder.form.mapping.list')}>
        {rows.map((r, i) => (
          <li key={i} className={styles.row} aria-label={t('builder.form.mapping.rowLabel', { label: t('builder.form.mapping.source'), name: r.source || t('builder.form.mapping.emptyRow') })}>
            <div className={styles.line}>
              <Checkbox checked={r.keep} disabled={readOnly} label={t('builder.form.mapping.keep', { name: r.source || t('builder.form.mapping.thisColumn') })} onChange={(keep) => patch(i, { keep })} />
              <div className={styles.grow}>
                <Field label={t('builder.form.mapping.source')} value={r.source} disabled={readOnly} onChange={(e) => patch(i, { source: e.target.value })} />
              </div>
              <Button icon aria-label={t('builder.form.mapping.remove', { name: r.source || t('builder.form.mapping.thisRow') })} disabled={readOnly} onClick={() => apply(rows.filter((_, j) => j !== i))}>
                <Icon name="close" />
              </Button>
            </div>
            <div className={styles.line}>
              <div className={styles.grow}>
                <Field label={t('builder.form.mapping.newName')} value={r.name} placeholder={r.source} disabled={readOnly} onChange={(e) => patch(i, { name: e.target.value })} />
              </div>
              <div>
                <span className={styles.typeLabel}>{t('builder.form.mapping.type')}</span>
                <Dropdown label={t('builder.form.mapping.typeOf', { type: t('builder.form.mapping.type'), name: r.source || t('builder.form.mapping.thisColumnLower') })} options={TYPE_OPTIONS} value={r.type} disabled={readOnly} width={110} onChange={(v) => patch(i, { type: v as MappingRow['type'] })} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {pasteOpen ? (
        <Dialog
          title={t('builder.form.mapping.pasteTitle')}
          onClose={() => setPasteOpen(false)}
          actions={
            <>
              <Button onClick={() => setPasteOpen(false)}>{t('builder.form.mapping.pasteCancel')}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const message = applyPaste(pasteText);
                  if (message) setPasteError(message);
                  else setPasteOpen(false);
                }}
              >
                {t('builder.form.mapping.pasteApply')}
              </Button>
            </>
          }
        >
          <div className={styles.dialogBody}>
            <TextAreaField label={t('builder.form.mapping.pasteLabel')} hint={t('builder.form.mapping.pasteHelp')} mono rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} error={pasteError ?? undefined} />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

