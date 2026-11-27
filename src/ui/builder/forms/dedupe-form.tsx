import { useState } from 'react';
import { Checkbox, Dropdown } from '../../components';
import { useT } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import { ColumnList, LoadColumnsBar, SectionLabel } from './column-pickers';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

type Keep = 'first' | 'last';

/** Remove duplicates: the columns that decide (all by default) and whether the first or the last of equal rows stays. */
export function DedupeForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const stored = Array.isArray(step.settings.columns) ? (step.settings.columns as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  const [all, setAll] = useState(stored.length === 0);
  const [columns, setColumns] = useState<string[]>(stored);
  const [keep, setKeep] = useState<Keep>(step.settings.keep === 'last' ? 'last' : 'first');
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  const save = (nextAll: boolean, nextColumns: string[], nextKeep: Keep): void => {
    onSettings({ ...step.settings, columns: nextAll ? [] : nextColumns, keep: nextKeep });
  };
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <Checkbox
        checked={all}
        disabled={readOnly}
        onChange={(next) => {
          setAll(next);
          save(next, columns, keep);
        }}
      >
        {t('builder.dedupe.allColumns')}
      </Checkbox>
      {all ? null : (
        <ColumnList
          label={t('builder.dedupe.columns')}
          hint={t('builder.dedupe.columnsHint')}
          values={columns}
          columns={names}
          disabled={readOnly}
          onChange={(next) => {
            setColumns(next);
            save(all, next, keep);
          }}
        />
      )}
      {!all && columns.length === 0 ? (
        <p className={styles.note} role="status">
          {t('builder.dedupe.noColumns')}
        </p>
      ) : null}
      <Bind name="keep" label={t('builder.dedupe.keep')}>
        <div>
          <SectionLabel label={t('builder.dedupe.keep')} hint={t('builder.dedupe.keepHint')} />
          <Dropdown
            label={t('builder.dedupe.keep')}
            options={[{ value: 'first', label: t('builder.dedupe.keepFirst') }, { value: 'last', label: t('builder.dedupe.keepLast') }]}
            value={keep}
            disabled={readOnly}
            width="100%"
            onChange={(k) => {
              setKeep(k as Keep);
              save(all, columns, k as Keep);
            }}
          />
        </div>
      </Bind>
    </div>
  );
}
