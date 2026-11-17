import { useState } from 'react';
import { TextAreaField } from '../../components';
import { sqlStrings as t } from '../../strings';
import { checkSql } from './output-logic';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** SQL: one read-only query over the inputs in1, in2, ... The text is saved as typed. */
export function SqlForm({ step, onSettings, readOnly }: FormProps) {
  const [text, setText] = useState(typeof step.settings.sql === 'string' ? step.settings.sql : '');
  const check = checkSql(text);
  const bad = check.kind !== 'ok';
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <TextAreaField
        label={t.query}
        hint={t.hint}
        mono
        rows={12}
        value={text}
        disabled={readOnly}
        error={bad ? check.message : undefined}
        status={bad ? undefined : check.message}
        onChange={(e) => {
          setText(e.target.value);
          onSettings({ ...step.settings, sql: e.target.value });
        }}
      />
    </div>
  );
}
