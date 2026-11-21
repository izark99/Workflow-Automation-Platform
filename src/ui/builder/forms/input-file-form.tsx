import { useState } from 'react';
import { Button, Checkbox, Dropdown, Field, Icon } from '../../components';
import { useT, errorText, translate } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { todayIso } from '../../screens/flows-logic';
import { runPreview } from '../preview-runner';
import { ColumnList, LoadColumnsBar, SectionLabel } from './column-pickers';
import type { SourceColumns } from './use-source-columns';
import pickers from './column-pickers.module.css';
import { Bind } from '../parameter-control/bind';
import { MARKER_MATCHES, STOP_KINDS, toFormValues, validateInputForm } from './input-file-logic';
import type { MarkerMatch, StopKind } from './input-file-logic';
import type { InputFormErrors, InputFormValues } from './input-file-logic';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** The columns that this step reads from its test file (the step runs alone), for the list of columns the file must have. */
function useOwnColumns({ step, definition, context }: Pick<FormProps, 'step' | 'definition' | 'context'>): SourceColumns {
  const [columns, setColumns] = useState<SourceColumns['columns']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const key = typeof step.settings.key === 'string' ? step.settings.key : '';
      const file = context.testFiles[key];
      if (!file) throw new Error(translate('builder.form.mapping.loadNeedsFile'));
      // Without the list of columns that the file must have: the list is what is being filled in.
      const { expect: _expect, ...settings } = step.settings;
      void _expect;
      const alone = { ...definition, nodes: [{ ...step, settings }], edges: [] };
      const data = await runPreview({ definition: alone, nodeId: step.id, handle: 'out', files: { [key]: { name: file.name, size: file.size, blob: file } }, refTables: [], effectiveDate: todayIso(), parameterValues: context.parameterValues });
      setColumns(data.columns);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  return { columns, loading, error, load };
}

/** Settings of an Input file step: which sheet and header row to read, rows to skip, merged cells, a row number column. */
export function InputFileForm(props: FormProps) {
  const { step, definition, onSettings, readOnly } = props;
  const t = useT();
  const [values, setValues] = useState<InputFormValues>(() => toFormValues(step.settings));
  const [errors, setErrors] = useState<InputFormErrors>({});
  const own = useOwnColumns(props);
  const otherKeys = definition.nodes.filter((n) => n.id !== step.id && n.type === 'input_file').map((n) => String(n.settings.key ?? ''));

  const change = (patch: Partial<InputFormValues>): void => {
    const next = { ...values, ...patch };
    setValues(next);
    const result = validateInputForm(next, otherKeys, step.settings);
    setErrors(result.errors);
    if (result.settings) onSettings(result.settings);
  };

  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <Field label={t('builder.form.input.key')} hint={t('builder.form.input.keyHint')} value={values.key} disabled={readOnly} error={errors.key} onChange={(e) => change({ key: e.target.value })} />
      <Bind name="sheet" label={t('builder.form.input.sheet')}>
        <Field label={t('builder.form.input.sheet')} hint={t('builder.form.input.sheetHint')} value={values.sheet} disabled={readOnly} onChange={(e) => change({ sheet: e.target.value })} />
      </Bind>
      <Bind name="headerRow" label={t('builder.form.input.headerRow')}>
        <Field label={t('builder.form.input.headerRow')} hint={t('builder.form.input.headerRowHint')} inputMode="numeric" value={values.headerRow} disabled={readOnly} error={errors.headerRow} onChange={(e) => change({ headerRow: e.target.value })} />
      </Bind>
      <Bind name="skipRows" label={t('builder.form.input.skipRows')}>
        <Field label={t('builder.form.input.skipRows')} hint={t('builder.form.input.skipRowsHint')} inputMode="numeric" value={values.skipRows} disabled={readOnly} error={errors.skipRows} onChange={(e) => change({ skipRows: e.target.value })} />
      </Bind>
      <Bind name="firstColumn" label={t('builder.form.input.firstColumn')}>
        <Field label={t('builder.form.input.firstColumn')} value={values.firstColumn} disabled={readOnly} error={errors.firstColumn} onChange={(e) => change({ firstColumn: e.target.value })} />
      </Bind>
      <Bind name="lastColumn" label={t('builder.form.input.lastColumn')}>
        <Field label={t('builder.form.input.lastColumn')} value={values.lastColumn} disabled={readOnly} error={errors.lastColumn} onChange={(e) => change({ lastColumn: e.target.value })} />
      </Bind>
      <div>
        <span className={pickers.label}>{t('builder.form.input.stopAt')}</span>
        <Dropdown
          label={t('builder.form.input.stopAt')}
          options={STOP_KINDS.map((k) => ({ value: k, label: t(`builder.form.input.stop.${k}` as MessageKey) }))}
          value={values.stopKind}
          disabled={readOnly}
          width="100%"
          onChange={(k) => change({ stopKind: k as StopKind })}
        />
      </div>
      {values.stopKind === 'blank_rows' ? <Field label={t('builder.form.input.blankCount')} inputMode="numeric" value={values.blankCount} disabled={readOnly} error={errors.blankCount} onChange={(e) => change({ blankCount: e.target.value })} /> : null}
      {values.stopKind === 'marker' ? (
        <>
          <Field label={t('builder.form.input.markerText')} value={values.markerText} disabled={readOnly} error={errors.markerText} onChange={(e) => change({ markerText: e.target.value })} />
          <div>
            <span className={pickers.label}>{t('builder.form.input.markerMatch')}</span>
            <Dropdown
              label={t('builder.form.input.markerMatch')}
              options={MARKER_MATCHES.map((m) => ({ value: m, label: t(`builder.form.input.match.${m}` as MessageKey) }))}
              value={values.markerMatch}
              disabled={readOnly}
              width="100%"
              onChange={(m) => change({ markerMatch: m as MarkerMatch })}
            />
          </div>
          <Field label={t('builder.form.input.markerColumn')} value={values.markerColumn} disabled={readOnly} onChange={(e) => change({ markerColumn: e.target.value })} />
        </>
      ) : null}
      {values.stopKind === 'row' ? <Field label={t('builder.form.input.stopRow')} inputMode="numeric" value={values.stopRow} disabled={readOnly} error={errors.stopRow} onChange={(e) => change({ stopRow: e.target.value })} /> : null}
      <div role="group" aria-label={t('builder.form.input.ignoreRows')} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t('builder.form.input.ignoreRows')} flush />
        {values.ignoreRows.map((r, i) => (
          <div key={i} className={pickers.rowCard}>
            <div className={pickers.line}>
              <div className={pickers.grow}>
                <Field label={t('common.numbered', { label: t('builder.form.input.ignoreColumn'), n: i + 1 })} value={r.column} disabled={readOnly} onChange={(e) => change({ ignoreRows: values.ignoreRows.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)) })} />
              </div>
              <div className={pickers.grow}>
                <Field label={t('common.numbered', { label: t('builder.form.input.ignoreText'), n: i + 1 })} value={r.text} disabled={readOnly} onChange={(e) => change({ ignoreRows: values.ignoreRows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </div>
              <Button icon disabled={readOnly} aria-label={t('builder.form.input.ignoreRemove', { n: i + 1 })} onClick={() => change({ ignoreRows: values.ignoreRows.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
          </div>
        ))}
        {errors.ignoreRows ? <p className={pickers.note} role="alert">{errors.ignoreRows}</p> : null}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => change({ ignoreRows: [...values.ignoreRows, { column: '', text: '' }] })}>
            {t('builder.form.input.ignoreAdd')}
          </Button>
        </div>
      </div>
      <LoadColumnsBar source={own} label={t('builder.form.input.loadOwn')} />
      <ColumnList label={t('builder.form.input.expect')} values={values.expect} columns={own.columns ? own.columns.map((c) => c.name) : null} disabled={readOnly} onChange={(expect) => change({ expect })} />
      <Field label={t('builder.form.input.fillDown')} hint={t('builder.form.input.fillDownHint')} value={values.fillDown} disabled={readOnly} onChange={(e) => change({ fillDown: e.target.value })} />
      <Checkbox checked={values.addRowNumber} disabled={readOnly} onChange={(checked) => change({ addRowNumber: checked })}>
        {t('builder.form.input.addRowNumber')}
      </Checkbox>
      {values.addRowNumber ? (
        <Bind name="rowNumberColumn" label={t('builder.form.input.rowNumberColumn')}>
          <Field label={t('builder.form.input.rowNumberColumn')} value={values.rowNumberColumn} disabled={readOnly} error={errors.rowNumberColumn} onChange={(e) => change({ rowNumberColumn: e.target.value })} />
        </Bind>
      ) : null}
    </div>
  );
}
