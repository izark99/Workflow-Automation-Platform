import { useState } from 'react';
import { Checkbox, Dropdown, Field } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { CUTS } from '../../../engine/nodes/split-column';
import { Bind } from '../parameter-control/bind';
import { ColumnList, ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { nameClashes, splitFromSettings, splitMissing, splitToSettings } from './split-logic';
import type { SplitValues } from './split-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Split column: the text column, where to cut, the names of the new columns, what to do with the rest, trim, the original. */
export function SplitForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<SplitValues>(() => splitFromSettings(step.settings));
  const source = useSourceColumns(props);
  // Only the text columns can be split.
  const names = source.columns ? source.columns.filter((c) => c.type === 'text').map((c) => c.name) : null;
  const all = source.columns ? source.columns.map((c) => c.name) : null;
  const apply = (next: SplitValues): void => {
    setV(next);
    onSettings(splitToSettings(next, step.settings));
  };
  const missing = splitMissing(v);
  const clashes = nameClashes(v, all);
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <ColumnSelect label={t('builder.split.column')} hint={t('builder.split.columnHint')} value={v.column} columns={names} disabled={readOnly} onChange={(column) => apply({ ...v, column })} />
      <Bind name="cut" label={t('builder.split.cut')}>
        <div>
          <SectionLabel label={t('builder.split.cut')} hint={t('builder.split.cutHint')} />
          <Dropdown label={t('builder.split.cut')} options={CUTS.map((c) => ({ value: c, label: t(`builder.split.cuts.${c}` as MessageKey) }))} value={v.cut} disabled={readOnly} width="100%" onChange={(cut) => apply({ ...v, cut: cut as SplitValues['cut'] })} />
        </div>
      </Bind>
      {v.cut === 'text' ? (
        <Bind name="separator" label={t('builder.split.separator')}>
          <Field label={t('builder.split.separator')} value={v.separator} disabled={readOnly} onChange={(e) => apply({ ...v, separator: e.target.value })} />
        </Bind>
      ) : null}
      <ColumnList label={t('builder.split.names')} hint={t('builder.split.namesHint')} values={v.names} columns={null} disabled={readOnly} onChange={(n) => apply({ ...v, names: n })} />
      {clashes.length > 0 ? (
        <p className={styles.note} role="alert">
          {t('builder.split.clash', { names: clashes.join(', ') })}
        </p>
      ) : null}
      <Bind name="rest" label={t('builder.split.rest')}>
        <div>
          <SectionLabel label={t('builder.split.rest')} hint={t('builder.split.restHint')} />
          <Dropdown label={t('builder.split.rest')} options={[{ value: 'last', label: t('builder.split.rests.last') }, { value: 'drop', label: t('builder.split.rests.drop') }]} value={v.rest} disabled={readOnly} width="100%" onChange={(rest) => apply({ ...v, rest: rest as SplitValues['rest'] })} />
        </div>
      </Bind>
      <Bind name="trim" label={t('builder.split.trim')}>
        <Checkbox checked={v.trim} disabled={readOnly} onChange={(trim) => apply({ ...v, trim })}>
          {t('builder.split.trim')}
        </Checkbox>
      </Bind>
      <Bind name="keepOriginal" label={t('builder.split.keepOriginal')}>
        <Checkbox checked={v.keepOriginal} disabled={readOnly} onChange={(keepOriginal) => apply({ ...v, keepOriginal })}>
          {t('builder.split.keepOriginal')}
        </Checkbox>
      </Bind>
      {missing.length > 0 ? (
        <p className={styles.note} role="status">
          {t('common.numbered', { label: t('builder.split.stillMissing'), n: missing.join(' ') })}
        </p>
      ) : null}
    </div>
  );
}
