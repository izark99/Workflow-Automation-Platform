import { useState } from 'react';
import { Checkbox, Field } from '../../components';
import { formStrings as t } from '../../strings';
import { toFormValues, validateInputForm } from './input-file-logic';
import type { InputFormErrors, InputFormValues } from './input-file-logic';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** Settings of an Input file step: which sheet and header row to read, rows to skip, merged cells, a row number column. */
export function InputFileForm({ step, definition, onSettings, readOnly }: FormProps) {
  const [values, setValues] = useState<InputFormValues>(() => toFormValues(step.settings));
  const [errors, setErrors] = useState<InputFormErrors>({});
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
      <Field label={t.input.key} hint={t.input.keyHint} value={values.key} disabled={readOnly} error={errors.key} onChange={(e) => change({ key: e.target.value })} />
      <Field label={t.input.sheet} hint={t.input.sheetHint} value={values.sheet} disabled={readOnly} onChange={(e) => change({ sheet: e.target.value })} />
      <Field label={t.input.headerRow} hint={t.input.headerRowHint} inputMode="numeric" value={values.headerRow} disabled={readOnly} error={errors.headerRow} onChange={(e) => change({ headerRow: e.target.value })} />
      <Field label={t.input.skipRows} hint={t.input.skipRowsHint} inputMode="numeric" value={values.skipRows} disabled={readOnly} error={errors.skipRows} onChange={(e) => change({ skipRows: e.target.value })} />
      <Field label={t.input.fillDown} hint={t.input.fillDownHint} value={values.fillDown} disabled={readOnly} onChange={(e) => change({ fillDown: e.target.value })} />
      <Checkbox checked={values.addRowNumber} disabled={readOnly} onChange={(checked) => change({ addRowNumber: checked })}>
        {t.input.addRowNumber}
      </Checkbox>
      {values.addRowNumber ? <Field label={t.input.rowNumberColumn} value={values.rowNumberColumn} disabled={readOnly} error={errors.rowNumberColumn} onChange={(e) => change({ rowNumberColumn: e.target.value })} /> : null}
    </div>
  );
}
