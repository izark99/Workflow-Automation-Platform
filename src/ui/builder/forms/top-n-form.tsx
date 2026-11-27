import { useState } from 'react';
import { Dropdown, Field } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import { ColumnList, ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { topNFromSettings, topNMissingBy, topNToSettings } from './top-n-logic';
import type { TopNValues } from './top-n-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

const ORDERS = ['largest', 'smallest', 'first'] as const;

/** Top N: how many rows, the order (largest, smallest or the first rows), the column or formula that orders them, and groups. */
export function TopNForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<TopNValues>(() => topNFromSettings(step.settings));
  const [error, setError] = useState<string | undefined>();
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  const apply = (next: TopNValues): void => {
    setV(next);
    const r = topNToSettings(next, step.settings);
    setError(r.error);
    if (r.settings) onSettings(r.settings);
  };
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <Bind name="n" label={t('builder.topN.n')}>
        <Field label={t('builder.topN.n')} hint={t('builder.topN.nHint')} inputMode="numeric" value={v.n} disabled={readOnly} error={error} onChange={(e) => apply({ ...v, n: e.target.value })} />
      </Bind>
      <Bind name="order" label={t('builder.topN.order')}>
        <div>
          <SectionLabel label={t('builder.topN.order')} />
          <Dropdown label={t('builder.topN.order')} options={ORDERS.map((o) => ({ value: o, label: t(`builder.topN.orders.${o}` as MessageKey) }))} value={v.order} disabled={readOnly} width="100%" onChange={(order) => apply({ ...v, order: order as TopNValues['order'] })} />
        </div>
      </Bind>
      {v.order === 'first' ? null : (
        <div className={styles.line}>
          <div>
            <span className={styles.label}>{t('builder.topN.byKind')}</span>
            <Dropdown label={t('builder.topN.byKind')} options={(['column', 'formula'] as const).map((x) => ({ value: x, label: t(`builder.output.kinds.${x}` as MessageKey) }))} value={v.byKind} disabled={readOnly} width={110} onChange={(byKind) => apply({ ...v, byKind: byKind as TopNValues['byKind'] })} />
          </div>
          <div className={styles.grow}>
            {v.byKind === 'column' ? (
              <ColumnSelect label={t('builder.topN.byColumn')} value={v.byColumn} columns={names} disabled={readOnly} onChange={(byColumn) => apply({ ...v, byColumn })} />
            ) : (
              <Field label={t('builder.topN.byFormula')} value={v.byExpression} disabled={readOnly} onChange={(e) => apply({ ...v, byExpression: e.target.value })} />
            )}
          </div>
        </div>
      )}
      {topNMissingBy(v) ? (
        <p className={styles.note} role="status">
          {t('builder.topN.missingBy')}
        </p>
      ) : null}
      <ColumnList label={t('builder.topN.groupBy')} hint={t('builder.topN.groupByHint')} values={v.groupBy} columns={names} disabled={readOnly} onChange={(groupBy) => apply({ ...v, groupBy })} />
    </div>
  );
}
