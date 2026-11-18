import { useState } from 'react';
import { Button, Checkbox, ErrorState, Field } from '../../components';
import { reshapeStrings as t } from '../../strings';
import { ColumnList, LoadColumnsBar } from './column-pickers';
import { addColumn, unpivotFromSettings, unpivotMissing, unpivotToSettings } from './reshape-logic';
import type { UnpivotValues } from './reshape-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Unpivot: which columns to keep, which to turn into rows, and the names of the two new columns. */
export function UnpivotForm(props: FormProps) {
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<UnpivotValues>(() => unpivotFromSettings(step.settings));
  const [clash, setClash] = useState<string | null>(null);
  const source = useSourceColumns(props);
  const names = source.columns ? source.columns.map((c) => c.name) : null;
  // A column that is already in the other list is not offered again.
  const offer = (other: string[]): string[] | null => (names ? names.filter((n) => !other.includes(n)) : null);

  const apply = (next: UnpivotValues): void => {
    setV(next);
    // Both names must be filled to save them; the lists are always saved.
    onSettings(unpivotToSettings(next, step.settings));
  };
  const change = (which: 'keep' | 'unpivot', list: string[], added: string | undefined): void => {
    // `list` is the new list from the picker; refuse a column that is in the other list.
    const other = which === 'keep' ? v.unpivot : v.keep;
    const clashing = added && other.includes(added) ? added : undefined;
    if (clashing) {
      setClash(addColumn(v[which], other, which === 'keep' ? t.unpivotList : t.keepList, clashing).error ?? null);
      return;
    }
    setClash(null);
    apply({ ...v, [which]: list });
  };
  const missing = unpivotMissing(v);
  const pick = (which: 'keep' | 'unpivot') => (list: string[]): void => change(which, list, list.find((x) => !v[which].includes(x)));

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <LoadColumnsBar source={source} />
      <ColumnList label={t.keep} values={v.keep} columns={offer(v.unpivot)} disabled={readOnly} onChange={pick('keep')} />
      <ColumnList label={t.unpivot} hint={t.unpivotHint} values={v.unpivot} columns={offer(v.keep)} disabled={readOnly} onChange={pick('unpivot')} />
      {names ? (
        <div>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, unpivot: names.filter((n) => !v.keep.includes(n)) })}>
            {t.unpivotRest}
          </Button>
        </div>
      ) : null}
      {clash ? <ErrorState what={t.clash} next={clash} /> : null}
      <Field label={t.nameColumn} hint={t.nameColumnHint} value={v.nameColumn} disabled={readOnly} onChange={(e) => apply({ ...v, nameColumn: e.target.value })} />
      <Field label={t.valueColumn} hint={t.valueColumnHint} value={v.valueColumn} disabled={readOnly} onChange={(e) => apply({ ...v, valueColumn: e.target.value })} />
      <Checkbox checked={v.skipBlank} disabled={readOnly} onChange={(skipBlank) => apply({ ...v, skipBlank })}>
        {t.skipBlank}
      </Checkbox>
      <p className={styles.note} role="status">
        {missing.length === 0 ? t.completeUnpivot : `${t.stillMissing} ${missing.join(' ')}`}
      </p>
    </div>
  );
}
