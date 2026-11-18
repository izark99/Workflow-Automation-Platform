import { useState } from 'react';
import { Dropdown, Field } from '../../components';
import { reshapeStrings as t } from '../../strings';
import { ColumnList, ColumnSelect, LoadColumnsBar } from './column-pickers';
import { refTableColumns } from './lookup-logic';
import { NAME_CASES, PIVOT_FNS, parseFill, pivotFromSettings, pivotMissing, pivotToSettings } from './reshape-logic';
import type { NameCase, PivotFn, PivotValues } from './reshape-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Pivot: the values of one column become new columns; the list of new columns comes from the data or from a reference table. */
export function PivotForm(props: FormProps) {
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
      <p className={styles.hint}>{t.pivotHint}</p>
      <LoadColumnsBar source={source} />
      <ColumnList label={t.rowKeys} values={v.rowKeys} columns={names} disabled={readOnly} onChange={(rowKeys) => apply({ ...v, rowKeys })} />
      <ColumnSelect label={t.columnSource} value={v.columnSource} columns={names} disabled={readOnly} width={338} onChange={(columnSource) => apply({ ...v, columnSource })} />
      <ColumnSelect label={t.value} value={v.value} columns={names} disabled={readOnly} width={338} onChange={(value) => apply({ ...v, value })} />
      <div>
        <span className={styles.label}>{t.aggregation}</span>
        <Dropdown label={t.aggregation} options={PIVOT_FNS.map((f) => ({ value: f, label: t.fnLabels[f] }))} value={v.aggregation} disabled={readOnly} width={338} onChange={(aggregation) => apply({ ...v, aggregation: aggregation as PivotFn })} />
      </div>
      <div>
        <span className={styles.label}>{t.newColumnsFrom}</span>
        <Dropdown
          label={t.newColumnsFrom}
          options={[{ value: 'data', label: t.fromData }, { value: 'reference', label: t.fromReference }]}
          value={v.from}
          disabled={readOnly}
          width={338}
          onChange={(from) => apply({ ...v, from: from as PivotValues['from'] })}
        />
      </div>
      {v.from === 'reference' ? (
        <>
          <div>
            <span className={styles.label}>{t.refTable}</span>
            <Dropdown label={t.refTable} options={[{ value: '', label: 'Choose a table' }, ...tableOptions]} value={v.table} disabled={readOnly} width={338} onChange={(table) => apply({ ...v, table, column: '' })} />
          </div>
          <ColumnSelect label={t.refColumn} value={v.column} columns={refNames} disabled={readOnly} width={338} onChange={(column) => apply({ ...v, column })} />
        </>
      ) : null}
      <Field label={t.fill} hint={t.fillHint} value={v.fill} disabled={readOnly} error={fill.ok ? undefined : fill.message} onChange={(e) => apply({ ...v, fill: e.target.value })} />
      <Field label={t.prefix} value={v.namePrefix} disabled={readOnly} onChange={(e) => apply({ ...v, namePrefix: e.target.value })} />
      <Field label={t.suffix} value={v.nameSuffix} disabled={readOnly} onChange={(e) => apply({ ...v, nameSuffix: e.target.value })} />
      <div>
        <span className={styles.label}>{t.nameCase}</span>
        <Dropdown label={t.nameCase} options={NAME_CASES.map((c) => ({ value: c, label: t.cases[c] }))} value={v.nameCase} disabled={readOnly} width={338} onChange={(nameCase) => apply({ ...v, nameCase: nameCase as NameCase })} />
        <p className={styles.hint}>{t.nameCaseHint}</p>
      </div>
      <p className={styles.hint} role="status">
        {missing.length === 0 ? t.completePivot : `${t.stillMissing} ${missing.join(' ')}`}
      </p>
    </div>
  );
}
