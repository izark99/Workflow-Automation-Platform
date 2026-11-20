import { useState } from 'react';
import { Dropdown, Field } from '../../components';
import { useT } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import type { MessageKey } from '../../i18n';
import { ColumnList, ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { refTableColumns, refTableUnreadable } from './lookup-logic';
import { NAME_CASES, PIVOT_FNS, parseFill, pivotFromSettings, pivotMissing, pivotToSettings } from './reshape-logic';
import type { NameCase, PivotFn, PivotValues } from './reshape-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Pivot: the values of one column become new columns; the list of new columns comes from the data or from a reference table. */
export function PivotForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly, context } = props;
  const [v, setV] = useState<PivotValues>(() => pivotFromSettings(step.settings));
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  const fill = parseFill(v.fill);

  const apply = (next: PivotValues): void => {
    setV(next);
    const r = pivotToSettings(next, step.settings);
    if (r.settings) onSettings(r.settings);
  };
  const refNames = v.table ? refTableColumns(context.refTables, v.table) : null;
  const tableOptions = context.refTables.map((x) => ({ value: x.name, label: x.name }));
  if (v.table && !tableOptions.some((o) => o.value === v.table)) tableOptions.push({ value: v.table, label: v.table });
  const missing = pivotMissing(v);

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <ColumnList label={t('builder.reshape.rowKeys')} values={v.rowKeys} columns={names} disabled={readOnly} onChange={(rowKeys) => apply({ ...v, rowKeys })} />
      <ColumnSelect label={t('builder.reshape.columnSource')} hint={t('builder.reshape.pivotHint')} value={v.columnSource} columns={names} disabled={readOnly} width="100%" onChange={(columnSource) => apply({ ...v, columnSource })} />
      <ColumnSelect label={t('builder.reshape.value')} value={v.value} columns={names} disabled={readOnly} width="100%" onChange={(value) => apply({ ...v, value })} />
      <Bind name="aggregation" label={t('builder.reshape.aggregation')}>
      <div>
        <span className={styles.label}>{t('builder.reshape.aggregation')}</span>
        <Dropdown label={t('builder.reshape.aggregation')} options={PIVOT_FNS.map((f) => ({ value: f, label: t(`builder.reshape.fnLabels.${f}` as MessageKey) }))} value={v.aggregation} disabled={readOnly} width="100%" onChange={(aggregation) => apply({ ...v, aggregation: aggregation as PivotFn })} />
      </div>
      </Bind>
      <div>
        <span className={styles.label}>{t('builder.reshape.newColumnsFrom')}</span>
        <Dropdown
          label={t('builder.reshape.newColumnsFrom')}
          options={[{ value: 'data', label: t('builder.reshape.fromData') }, { value: 'reference', label: t('builder.reshape.fromReference') }]}
          value={v.from}
          disabled={readOnly}
          width="100%"
          onChange={(from) => apply({ ...v, from: from as PivotValues['from'] })}
        />
      </div>
      {v.from === 'reference' ? (
        <>
          <div>
            <span className={styles.label}>{t('builder.reshape.refTable')}</span>
            <Dropdown label={t('builder.reshape.refTable')} options={[{ value: '', label: t('builder.reshape.chooseTable') }, ...tableOptions]} value={v.table} disabled={readOnly} width="100%" onChange={(table) => apply({ ...v, table, column: '' })} />
          </div>
          {v.table && refTableUnreadable(context.refTables, v.table) ? (
            <p className={styles.note} role="status">
              {t('builder.reshape.refUnreadable')}
            </p>
          ) : null}
          <ColumnSelect label={t('builder.reshape.refColumn')} value={v.column} columns={refNames} disabled={readOnly} width="100%" onChange={(column) => apply({ ...v, column })} />
        </>
      ) : null}
      <Bind name="fill" label={t('builder.reshape.fill')}>
      <Field label={t('builder.reshape.fill')} hint={t('builder.reshape.fillHint')} value={v.fill} disabled={readOnly} error={fill.ok ? undefined : fill.message} onChange={(e) => apply({ ...v, fill: e.target.value })} />
      </Bind>
      <Bind name="namePrefix" label={t('builder.reshape.prefix')}>
      <Field label={t('builder.reshape.prefix')} value={v.namePrefix} disabled={readOnly} onChange={(e) => apply({ ...v, namePrefix: e.target.value })} />
      </Bind>
      <Bind name="nameSuffix" label={t('builder.reshape.suffix')}>
      <Field label={t('builder.reshape.suffix')} value={v.nameSuffix} disabled={readOnly} onChange={(e) => apply({ ...v, nameSuffix: e.target.value })} />
      </Bind>
      <Bind name="nameCase" label={t('builder.reshape.nameCase')}>
      <div>
        <SectionLabel label={t('builder.reshape.nameCase')} hint={t('builder.reshape.nameCaseHint')} />
        <Dropdown label={t('builder.reshape.nameCase')} options={NAME_CASES.map((c) => ({ value: c, label: t(`builder.reshape.cases.${c}` as MessageKey) }))} value={v.nameCase} disabled={readOnly} width="100%" onChange={(nameCase) => apply({ ...v, nameCase: nameCase as NameCase })} />
      </div>
      </Bind>
      <p className={styles.note} role="status">
        {missing.length === 0 ? t('builder.reshape.completePivot') : t('common.numbered', { label: t('builder.reshape.stillMissing'), n: missing.join(' ') })}
      </p>
    </div>
  );
}
