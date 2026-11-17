import { useState } from 'react';
import { formStrings as t } from '../../strings';
import { FormulaEditor } from './formula-editor';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from '../settings-panel.module.css';

/** Settings of a Filter step: the condition, which must give true or false. The text is saved as typed. */
export function FilterForm(props: FormProps) {
  const { step, onSettings, readOnly } = props;
  const [text, setText] = useState(typeof step.settings.condition === 'string' ? step.settings.condition : '');
  const source = useSourceColumns(props);
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <FormulaEditor
        label={t.filter.condition}
        hint={t.filter.conditionHint}
        value={text}
        readOnly={readOnly}
        source={source}
        expect="boolean"
        rows={6}
        onChange={(next) => {
          setText(next);
          onSettings({ ...step.settings, condition: next });
        }}
      />
    </div>
  );
}
