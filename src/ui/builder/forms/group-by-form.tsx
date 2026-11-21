import { useState } from 'react';
import { Button, Dropdown, Field, Icon } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ColumnList, ColumnSelect, LoadColumnsBar } from './column-pickers';
import { AGG_FNS, groupByFromSettings, groupByMissing, groupByToSettings } from './lookup-logic';
import type { AggFn, GroupByValues } from './lookup-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Group by: the columns to group on and the aggregations (sum, count, min, max, average) to compute for each group. */
export function GroupByForm(props: FormProps) {
  const t = useT();
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
      <LoadColumnsBar source={source} />
      <ColumnList label={t('builder.group.groupColumns')} hint={t('builder.group.hint')} values={v.groupBy} columns={names} disabled={readOnly} onChange={(groupBy) => apply({ ...v, groupBy })} />
      <div role="group" aria-label={t('builder.group.aggregations')} style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={styles.label} style={{ marginBottom: 0 }}>{t('builder.group.aggregations')}</span>
        {v.aggregations.map((a, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <div>
                <span className={styles.label}>{t('builder.group.fn')}</span>
                <Dropdown label={t('common.numbered', { label: t('builder.group.fn'), n: i + 1 })} options={AGG_FNS.map((f) => ({ value: f, label: t(`builder.group.fnLabels.${f}` as MessageKey) }))} value={a.fn} disabled={readOnly} width={110} onChange={(f) => patch(i, { fn: f as AggFn })} />
              </div>
              <ColumnSelect label={t('common.numbered', { label: t('builder.group.column'), n: i + 1 })} value={a.column} columns={names} disabled={readOnly} width={150} onChange={(column) => patch(i, { column })} />
              <Button icon disabled={readOnly} aria-label={t('builder.group.remove', { n: i + 1 })} onClick={() => apply({ ...v, aggregations: v.aggregations.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
            <Field label={t('common.numbered', { label: t('builder.group.resultName'), n: i + 1 })} value={a.as} placeholder={a.column ? `${a.fn}_${a.column}` : a.fn} data-code disabled={readOnly} onChange={(e) => patch(i, { as: e.target.value })} />
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, aggregations: [...v.aggregations, { fn: 'sum', column: '', as: '' }] })}>
            {t('builder.group.add')}
          </Button>
        </div>
      </div>
      <p className={styles.note} role="status">
        {missing.length === 0 ? t('builder.group.complete') : t('common.numbered', { label: t('builder.group.stillMissing'), n: missing.join(' ') })}
      </p>
    </div>
  );
}
