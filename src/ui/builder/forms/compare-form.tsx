import { useState } from 'react';
import { Button, Checkbox, Icon } from '../../components';
import { useT } from '../../i18n';
import { ColumnList, ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { compareFromSettings, compareMissing, compareToSettings, comparableColumns } from './compare-logic';
import type { CompareValues } from './compare-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Compare: the key columns of the two tables, and which columns to compare (all that both have, by default). */
export function CompareForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly } = props;
  const [v, setV] = useState<CompareValues>(() => compareFromSettings(step.settings));
  const newSide = useSourceColumns(props, 'new');
  const oldSide = useSourceColumns(props, 'old');
  const newNames = newSide.columns ? newSide.columns.map((c) => c.name) : null;
  const oldNames = oldSide.columns ? oldSide.columns.map((c) => c.name) : null;
  const apply = (next: CompareValues): void => {
    setV(next);
    onSettings(compareToSettings(next, step.settings));
  };
  const patchKey = (i: number, change: Partial<CompareValues['keys'][number]>): void => apply({ ...v, keys: v.keys.map((k, j) => (j === i ? { ...k, ...change } : k)) });
  const missing = compareMissing(v);
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <LoadColumnsBar source={newSide} label={t('builder.compare.loadNew')} />
        <LoadColumnsBar source={oldSide} label={t('builder.compare.loadOld')} />
      </div>
      <div role="group" aria-label={t('builder.compare.keys')} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t('builder.compare.keys')} hint={t('builder.compare.keysHint')} flush />
        {v.keys.map((k, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <ColumnSelect label={t('common.numbered', { label: t('builder.compare.keyNew'), n: i + 1 })} value={k.new} columns={newNames} disabled={readOnly} onChange={(x) => patchKey(i, { new: x })} />
              <ColumnSelect label={t('common.numbered', { label: t('builder.compare.keyOld'), n: i + 1 })} value={k.old} columns={oldNames} disabled={readOnly} onChange={(x) => patchKey(i, { old: x })} />
              <Button icon disabled={readOnly} aria-label={t('builder.compare.removeKey', { n: i + 1 })} onClick={() => apply({ ...v, keys: v.keys.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button size="sm" disabled={readOnly} onClick={() => apply({ ...v, keys: [...v.keys, { new: '', old: '' }] })}>
            {t('builder.compare.addKey')}
          </Button>
        </div>
      </div>
      <Checkbox checked={v.all} disabled={readOnly} onChange={(all) => apply({ ...v, all })}>
        {t('builder.compare.allColumns')}
      </Checkbox>
      {v.all ? null : (
        <ColumnList label={t('builder.compare.columns')} hint={t('builder.compare.columnsHint')} values={v.compare} columns={comparableColumns(v, newNames, oldNames)} disabled={readOnly} onChange={(compare) => apply({ ...v, compare })} />
      )}
      {missing.length > 0 ? (
        <p className={styles.note} role="status">
          {t('common.numbered', { label: t('builder.compare.stillMissing'), n: missing.join(' ') })}
        </p>
      ) : null}
    </div>
  );
}
