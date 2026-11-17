import { useState } from 'react';
import { Button, Dropdown, Field, Icon } from '../../components';
import { groupStrings as t } from '../../strings';
import { ColumnList, ColumnSelect, LoadColumnsBar } from './column-pickers';
import { AGG_FNS, groupByFromSettings, groupByMissing, groupByToSettings } from './lookup-logic';
import type { AggFn, GroupByValues } from './lookup-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Group by: the columns to group on and the aggregations (sum, count, min, max, average) to compute for each group. */
export function GroupByForm(props: FormProps) {
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<GroupByValues>(() => groupByFromSettings(step.settings));
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  const apply = (next: GroupByValues): void => {
    setV(next);
    onSettings(groupByToSettings(next, step.settings));
  };
  const missing = groupByMissing(v);
  const patch = (i: number, change: Partial<GroupByValues['aggregations'][number]>): void => apply({ ...v, aggregations: v.aggregations.map((a, j) => (j === i ? { ...a, ...change } : a)) });

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <p className={styles.hint}>{t.hint}</p>
      <LoadColumnsBar source={source} />
      <ColumnList label={t.groupColumns} values={v.groupBy} columns={names} disabled={readOnly} onChange={(groupBy) => apply({ ...v, groupBy })} />
      <div role="group" aria-label={t.aggregations} style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={styles.label} style={{ marginBottom: 0 }}>{t.aggregations}</span>
        {v.aggregations.map((a, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <div>
                <span className={styles.label}>{t.fn}</span>
                <Dropdown label={`${t.fn} ${i + 1}`} options={AGG_FNS.map((f) => ({ value: f, label: t.fnLabels[f] }))} value={a.fn} disabled={readOnly} width={110} onChange={(f) => patch(i, { fn: f as AggFn })} />
              </div>
              <ColumnSelect label={`${t.column} ${i + 1}`} value={a.column} columns={names} disabled={readOnly} width={150} onChange={(column) => patch(i, { column })} />
              <Button compact disabled={readOnly} aria-label={t.remove(i + 1)} onClick={() => apply({ ...v, aggregations: v.aggregations.filter((_, j) => j !== i) })}>
                <Icon name="close" />
              </Button>
            </div>
            <Field label={`${t.resultName} ${i + 1}`} value={a.as} placeholder={a.column ? `${a.fn}_${a.column}` : a.fn} disabled={readOnly} onChange={(e) => patch(i, { as: e.target.value })} />
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, aggregations: [...v.aggregations, { fn: 'sum', column: '', as: '' }] })}>
            {t.add}
          </Button>
        </div>
      </div>
      <p className={styles.hint} role="status">
        {missing.length === 0 ? t.complete : `${t.stillMissing} ${missing.join(' ')}`}
      </p>
    </div>
  );
}
