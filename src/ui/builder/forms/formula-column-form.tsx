import { useState } from 'react';
import { Field } from '../../components';
import { formulaStrings as t } from '../../strings';
import { FormulaEditor } from './formula-editor';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from '../settings-panel.module.css';

/** Settings of a Formula column step: the name of the column and its formula. The formula is saved as typed. */
export function FormulaColumnForm(props: FormProps) {
  const { step, onSettings, readOnly } = props;
  const [name, setName] = useState(typeof step.settings.name === 'string' ? step.settings.name : '');
  const [expression, setExpression] = useState(typeof step.settings.expression === 'string' ? step.settings.expression : '');
  const [nameError, setNameError] = useState(false);
  const source = useSourceColumns(props);

  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <Field
        label={t.name}
        hint={t.nameHint}
        value={name}
        disabled={readOnly}
        error={nameError ? `${t.emptyName} ${t.emptyNameNext}` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          const clean = e.target.value.trim();
          setNameError(clean === '');
          if (clean !== '') onSettings({ ...step.settings, name: clean });
        }}
      />
      <FormulaEditor
        label={t.formula}
        hint={t.formulaHint}
        value={expression}
        readOnly={readOnly}
        source={source}
        onChange={(text) => {
          setExpression(text);
          onSettings({ ...step.settings, expression: text });
        }}
      />
    </div>
  );
}
