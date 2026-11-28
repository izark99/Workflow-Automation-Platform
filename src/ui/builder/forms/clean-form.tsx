import { useState } from 'react';
import { Checkbox, Dropdown, Field } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { CASE_MODES } from '../../../engine/nodes/clean-text';
import { Bind } from '../parameter-control/bind';
import { ColumnList, LoadColumnsBar, SectionLabel } from './column-pickers';
import { cleanFromSettings, cleanMissing, cleanToSettings } from './clean-logic';
import type { CleanValues } from './clean-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Clean text: the text columns, what to clean (spaces, characters that print nothing, marks, letter case) and where the result goes. */
export function CleanForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<CleanValues>(() => cleanFromSettings(step.settings));
  const source = useSourceColumns(props);
  // Only the text columns can be cleaned.
  const names = source.columns ? source.columns.filter((c) => c.type === 'text').map((c) => c.name) : null;
  const apply = (next: CleanValues): void => {
    setV(next);
    onSettings(cleanToSettings(next, step.settings));
  };
  const flag = (name: 'trim' | 'collapse' | 'nonPrinting' | 'removeMarks') => (
    <Bind name={name} label={t(`builder.clean.${name}` as MessageKey)}>
      <Checkbox checked={v[name]} disabled={readOnly} onChange={(on) => apply({ ...v, [name]: on })}>
        {t(`builder.clean.${name}` as MessageKey)}
      </Checkbox>
    </Bind>
  );
  const missing = cleanMissing(v);
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <ColumnList label={t('builder.clean.columns')} hint={t('builder.clean.columnsHint')} values={v.columns} columns={names} disabled={readOnly} onChange={(columns) => apply({ ...v, columns })} />
      {flag('trim')}
      {flag('collapse')}
      {flag('nonPrinting')}
      {flag('removeMarks')}
      <Bind name="caseMode" label={t('builder.clean.caseMode')}>
        <div>
          <SectionLabel label={t('builder.clean.caseMode')} />
          <Dropdown label={t('builder.clean.caseMode')} options={CASE_MODES.map((c) => ({ value: c, label: t(`builder.clean.cases.${c}` as MessageKey) }))} value={v.caseMode} disabled={readOnly} width="100%" onChange={(caseMode) => apply({ ...v, caseMode: caseMode as CleanValues['caseMode'] })} />
        </div>
      </Bind>
      <Bind name="target" label={t('builder.clean.target')}>
        <div>
          <SectionLabel label={t('builder.clean.target')} hint={t('builder.clean.targetHint')} />
          <Dropdown label={t('builder.clean.target')} options={(['replace', 'suffix'] as const).map((x) => ({ value: x, label: t(`builder.clean.targets.${x}` as MessageKey) }))} value={v.target} disabled={readOnly} width="100%" onChange={(target) => apply({ ...v, target: target as CleanValues['target'] })} />
        </div>
      </Bind>
      {v.target === 'suffix' ? (
        <Bind name="suffix" label={t('builder.clean.suffix')}>
          <Field label={t('builder.clean.suffix')} value={v.suffix} disabled={readOnly} onChange={(e) => apply({ ...v, suffix: e.target.value })} />
        </Bind>
      ) : null}
      {missing.length > 0 ? (
        <p className={styles.note} role="status">
          {t('common.numbered', { label: t('builder.clean.stillMissing'), n: missing.join(' ') })}
        </p>
      ) : null}
    </div>
  );
}
