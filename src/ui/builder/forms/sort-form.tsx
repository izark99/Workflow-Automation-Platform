import { useState } from 'react';
import { useT } from '../../i18n';
import { LoadColumnsBar } from './column-pickers';
import { sortRowDone, sortRowsFromList, sortRowsToList } from './sort-logic';
import type { SortRow } from './sort-logic';
import { SortRows } from './sort-rows';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Sort: the keys, each a column or a formula with a direction. Empty values go last; equal keys keep the input order. */
export function SortForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [rows, setRows] = useState<SortRow[]>(() => sortRowsFromList(step.settings.keys));
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  const apply = (next: SortRow[]): void => {
    setRows(next);
    onSettings({ ...step.settings, keys: sortRowsToList(next) });
  };
  const unfinished = rows.some((k) => !sortRowDone(k));
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <SortRows rows={rows} names={names} readOnly={readOnly} onChange={apply} />
      {rows.length === 0 || unfinished ? (
        <p className={styles.note} role="status">
          {t(rows.length === 0 ? 'builder.sort.noKeys' : 'builder.output.missing.sortRow')}
        </p>
      ) : null}
    </div>
  );
}
