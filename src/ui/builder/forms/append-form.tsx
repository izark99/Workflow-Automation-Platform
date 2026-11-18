import { useState } from 'react';
import { Dropdown } from '../../components';
import { appendStrings as t } from '../../strings';
import { appendFromSettings } from './output-logic';
import type { AppendMatch } from './output-logic';
import type { FormProps } from './types';
import { SectionLabel } from './column-pickers';
import styles from './column-pickers.module.css';

/** Append: stack the inputs by column name or by position. */
export function AppendForm({ step, onSettings, readOnly }: FormProps) {
  const [match, setMatch] = useState<AppendMatch>(() => appendFromSettings(step.settings));
  return (
    <div className={styles.rowCard} style={{ gap: 12, borderBottom: 0, padding: 0 }}>
      <div>
        <SectionLabel label={t.match} hint={t.hint} />
        <Dropdown
          label={t.match}
          options={[{ value: 'name', label: t.byName }, { value: 'position', label: t.byPosition }]}
          value={match}
          disabled={readOnly}
          width={338}
          onChange={(m) => {
            setMatch(m as AppendMatch);
            onSettings({ ...step.settings, match: m });
          }}
        />
      </div>
    </div>
  );
}
