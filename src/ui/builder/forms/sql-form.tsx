import { useState } from 'react';
import { TextAreaField } from '../../components';
import { useT } from '../../i18n';
import { checkSql } from './output-logic';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** SQL: one read-only query over the inputs in1, in2, ... The text is saved as typed. */
export function SqlForm({ step, onSettings, readOnly }: FormProps) {
  const t = useT();
  const [text, setText] = useState(typeof step.settings.sql === 'string' ? step.settings.sql : '');
  const check = checkSql(text);
  // An empty query is not an error on arrival: the guide shows, and the error comes when the user leaves the field.
  const [touched, setTouched] = useState(false);
  const guide = check.kind === 'empty' && !touched;
  const bad = check.kind !== 'ok' && !guide;
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <TextAreaField
        label={t('builder.sql.query')}
        hint={t('builder.sql.hint')}
        mono
        data-code
        rows={12}
        value={text}
        disabled={readOnly}
        error={bad ? check.message : undefined}
        note={guide ? check.message : undefined}
        status={bad || guide ? undefined : check.message}
        onBlur={() => setTouched(true)}
        onChange={(e) => {
          setText(e.target.value);
          onSettings({ ...step.settings, sql: e.target.value });
        }}
      />
    </div>
  );
}
