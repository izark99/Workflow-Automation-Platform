import { useState } from 'react';
import { withBindingPlaceholders } from '../../../engine/flow/bindable';
import { checkOutputNodes } from '../../../engine/nodes/output';
import { Button, Checkbox, Dropdown, ErrorState, Field, Icon } from '../../components';
import { useT, errorText } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import { ColumnList, ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { outputFromSettings, outputMissing, outputToSettings } from './output-logic';
import type { OutputErrors, OutputFormat, OutputValues, SortRow } from './output-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Output: the file, the sheet, which columns to write, how to sort, and which text columns are written as numbers. */
export function OutputForm(props: FormProps) {
  const t = useT();
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
    checkOutputNodes(withBindingPlaceholders(definition));
  } catch (e) {
    const message = errorText(e);
    if (message.includes(`"${step.id}"`)) clash = message;
  }
  const missing = outputMissing(v);

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <Bind name="file" label={t('builder.output.file')}>
        <Field label={t('builder.output.file')} hint={t('builder.output.fileHint')} value={v.file} disabled={readOnly} error={errors.file} onChange={(e) => apply({ ...v, file: e.target.value })} />
      </Bind>
      <Bind name="format" label={t('builder.output.format')}>
      <div>
        <span className={styles.label}>{t('builder.output.format')}</span>
        <Dropdown label={t('builder.output.format')} options={(['xlsx', 'csv'] as const).map((f) => ({ value: f, label: t(`builder.output.formats.${f}` as MessageKey) }))} value={v.format} disabled={readOnly} width="100%" onChange={(format) => apply({ ...v, format: format as OutputFormat })} />
      </div>
      </Bind>
      {v.format === 'xlsx' ? (
        <Bind name="sheet" label={t('builder.output.sheet')}>
          <Field label={t('builder.output.sheet')} hint={t('builder.output.sheetHint')} value={v.sheet} disabled={readOnly} error={errors.sheet} onChange={(e) => apply({ ...v, sheet: e.target.value })} />
        </Bind>
      ) : null}
      {clash ? <ErrorState what={t('builder.output.clash')} next={clash} /> : null}

      <LoadColumnsBar source={source} />
      <Checkbox checked={v.allColumns} disabled={readOnly} onChange={(allColumns) => apply({ ...v, allColumns })}>
        {t('builder.output.allColumns')}
      </Checkbox>
      {v.allColumns ? null : (
        <>
          <ColumnList label={t('builder.output.columns')} hint={t('builder.output.columnsHint')} values={v.columns} columns={names} disabled={readOnly} onChange={(columns) => apply({ ...v, columns })} />
        </>
      )}

      <div role="group" aria-label={t('builder.output.sort')} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t('builder.output.sort')} hint={t('builder.output.sortHint')} flush />
        {v.sort.map((k, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <div>
                <span className={styles.label}>{t('common.numbered', { label: t('builder.output.kind'), n: i + 1 })}</span>
                <Dropdown label={t('common.numbered', { label: t('builder.output.kind'), n: i + 1 })} options={(['column', 'formula'] as const).map((x) => ({ value: x, label: t(`builder.output.kinds.${x}` as MessageKey) }))} value={k.kind} disabled={readOnly} width={110} onChange={(kind) => patchSort(i, { kind: kind as SortRow['kind'] })} />
              </div>
              <div className={styles.grow}>
                {k.kind === 'column' ? (
                  <ColumnSelect label={t('common.numbered', { label: t('builder.output.sortColumn'), n: i + 1 })} value={k.column} columns={names} disabled={readOnly} width={150} onChange={(column) => patchSort(i, { column })} />
                ) : (
                  <Field label={t('common.numbered', { label: t('builder.output.sortFormula'), n: i + 1 })} value={k.expression} disabled={readOnly} onChange={(e) => patchSort(i, { expression: e.target.value })} />
                )}
              </div>
              <Button icon disabled={readOnly} aria-label={t('builder.output.removeSort', { n: i + 1 })} onClick={() => apply({ ...v, sort: v.sort.filter((_, j) => j !== i) })}>
                <Icon name="close" />
              </Button>
            </div>
            <div>
              <span className={styles.label}>{t('common.numbered', { label: t('builder.output.direction'), n: i + 1 })}</span>
              <Dropdown label={t('common.numbered', { label: t('builder.output.direction'), n: i + 1 })} options={(['asc', 'desc'] as const).map((x) => ({ value: x, label: t(`builder.output.directions.${x}` as MessageKey) }))} value={k.direction} disabled={readOnly} width={150} onChange={(direction) => patchSort(i, { direction: direction as SortRow['direction'] })} />
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, sort: [...v.sort, { kind: 'column', column: '', expression: '', direction: 'asc' }] })}>
            {t('builder.output.addSort')}
          </Button>
        </div>
      </div>

      <ColumnList label={t('builder.output.numberLike')} hint={t('builder.output.numberLikeHint')} values={v.numberLikeText} columns={names} disabled={readOnly} onChange={(numberLikeText) => apply({ ...v, numberLikeText })} />
      {missing.length > 0 ? (
        <p className={styles.note} role="status">
          {t('common.numbered', { label: t('builder.output.stillMissing'), n: missing.join(' ') })}
        </p>
      ) : null}
    </div>
  );
}
