import { useState } from 'react';
import { checkOutputNodes } from '../../../engine/nodes/output';
import { Button, Checkbox, Dropdown, ErrorState, Field, Icon } from '../../components';
import { outputStrings as t } from '../../strings';
import { ColumnList, ColumnSelect, LoadColumnsBar } from './column-pickers';
import { outputFromSettings, outputMissing, outputToSettings } from './output-logic';
import type { OutputErrors, OutputFormat, OutputValues, SortRow } from './output-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Output: the file, the sheet, which columns to write, how to sort, and which text columns are written as numbers. */
export function OutputForm(props: FormProps) {
  const { step, definition, onSettings, readOnly } = props;
  const [v, setV] = useState<OutputValues>(() => outputFromSettings(step.settings));
  const [errors, setErrors] = useState<OutputErrors>({});
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;

  const apply = (next: OutputValues): void => {
    setV(next);
    const r = outputToSettings(next, step.settings);
    setErrors(r.errors);
    if (r.settings) onSettings(r.settings);
  };
  const patchSort = (i: number, change: Partial<SortRow>): void => apply({ ...v, sort: v.sort.map((k, j) => (j === i ? { ...k, ...change } : k)) });

  // The engine checks all Output steps together (sheet names, formats, csv files). Show its message when it is about this step.
  let clash: string | null = null;
  try {
    checkOutputNodes(definition);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes(`"${step.id}"`)) clash = message;
  }
  const missing = outputMissing(v);

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <Field label={t.file} hint={t.fileHint} value={v.file} disabled={readOnly} error={errors.file} onChange={(e) => apply({ ...v, file: e.target.value })} />
      <div>
        <span className={styles.label}>{t.format}</span>
        <Dropdown label={t.format} options={(['xlsx', 'csv'] as const).map((f) => ({ value: f, label: t.formats[f] }))} value={v.format} disabled={readOnly} width={338} onChange={(format) => apply({ ...v, format: format as OutputFormat })} />
      </div>
      {v.format === 'xlsx' ? <Field label={t.sheet} hint={t.sheetHint} value={v.sheet} disabled={readOnly} error={errors.sheet} onChange={(e) => apply({ ...v, sheet: e.target.value })} /> : null}
      {clash ? <ErrorState what={t.clash} next={clash} /> : null}

      <LoadColumnsBar source={source} />
      <Checkbox checked={v.allColumns} disabled={readOnly} onChange={(allColumns) => apply({ ...v, allColumns })}>
        {t.allColumns}
      </Checkbox>
      {v.allColumns ? null : (
        <>
          <p className={styles.hint}>{t.columnsHint}</p>
          <ColumnList label={t.columns} values={v.columns} columns={names} disabled={readOnly} onChange={(columns) => apply({ ...v, columns })} />
        </>
      )}

      <div role="group" aria-label={t.sort} style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={styles.label} style={{ marginBottom: 0 }}>{t.sort}</span>
        <p className={styles.hint}>{t.sortHint}</p>
        {v.sort.map((k, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <div>
                <span className={styles.label}>{`${t.kind} ${i + 1}`}</span>
                <Dropdown label={`${t.kind} ${i + 1}`} options={(['column', 'formula'] as const).map((x) => ({ value: x, label: t.kinds[x] }))} value={k.kind} disabled={readOnly} width={110} onChange={(kind) => patchSort(i, { kind: kind as SortRow['kind'] })} />
              </div>
              <div className={styles.grow}>
                {k.kind === 'column' ? (
                  <ColumnSelect label={`${t.sortColumn} ${i + 1}`} value={k.column} columns={names} disabled={readOnly} width={150} onChange={(column) => patchSort(i, { column })} />
                ) : (
                  <Field label={`${t.sortFormula} ${i + 1}`} value={k.expression} disabled={readOnly} onChange={(e) => patchSort(i, { expression: e.target.value })} />
                )}
              </div>
              <Button compact disabled={readOnly} aria-label={t.removeSort(i + 1)} onClick={() => apply({ ...v, sort: v.sort.filter((_, j) => j !== i) })}>
                <Icon name="close" />
              </Button>
            </div>
            <div>
              <span className={styles.label}>{`${t.direction} ${i + 1}`}</span>
              <Dropdown label={`${t.direction} ${i + 1}`} options={(['asc', 'desc'] as const).map((x) => ({ value: x, label: t.directions[x] }))} value={k.direction} disabled={readOnly} width={150} onChange={(direction) => patchSort(i, { direction: direction as SortRow['direction'] })} />
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, sort: [...v.sort, { kind: 'column', column: '', expression: '', direction: 'asc' }] })}>
            {t.addSort}
          </Button>
        </div>
      </div>

      <p className={styles.hint}>{t.numberLikeHint}</p>
      <ColumnList label={t.numberLike} values={v.numberLikeText} columns={names} disabled={readOnly} onChange={(numberLikeText) => apply({ ...v, numberLikeText })} />
      {missing.length > 0 ? (
        <p className={styles.hint} role="status">
          {`${t.stillMissing} ${missing.join(' ')}`}
        </p>
      ) : null}
    </div>
  );
}
