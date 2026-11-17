import { useState } from 'react';
import { TextAreaField } from '../../components';
import { formStrings as t } from '../../strings';
import { checkFormulaSyntax } from './formula-check';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** Settings of a Filter step: the condition. The text is saved as typed; the check below it says if it is written correctly. */
export function FilterForm({ step, onSettings, readOnly }: FormProps) {
  const [text, setText] = useState(typeof step.settings.condition === 'string' ? step.settings.condition : '');
  const check = checkFormulaSyntax(text);
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <TextAreaField
        label={t.filter.condition}
        hint={t.filter.conditionHint}
        mono
        rows={6}
        value={text}
        disabled={readOnly}
        error={check.ok ? undefined : check.message}
        status={check.ok ? t.filter.valid : undefined}
        onChange={(e) => {
          setText(e.target.value);
          onSettings({ ...step.settings, condition: e.target.value });
        }}
      />
    </div>
  );
}
