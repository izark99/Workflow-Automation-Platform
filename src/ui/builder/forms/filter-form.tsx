import { useState } from 'react';
import { useT } from '../../i18n';
import { parametersOf } from '../../../engine/flow/parameters';
import { FormulaEditor } from './formula-editor';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from '../settings-panel.module.css';

/** Settings of a Filter step: the condition, which must give true or false. The text is saved as typed. */
export function FilterForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [text, setText] = useState(typeof step.settings.condition === 'string' ? step.settings.condition : '');
  const source = useSourceColumns(props);
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <FormulaEditor
        label={t('builder.form.filter.condition')}
        hint={t('builder.form.filter.conditionHint')}
        value={text}
        readOnly={readOnly}
        source={source}
        expect="boolean"
        parameters={parametersOf(props.definition)}
        rows={6}
        onChange={(next) => {
          setText(next);
          onSettings({ ...step.settings, condition: next });
        }}
      />
    </div>
  );
}
