import { useState } from 'react';
import { resolvedEdges } from '../graph';
import { Button, Dropdown, Field, Icon } from '../../components';
import { joinStrings as t } from '../../strings';
import { ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { NO_MATCH, lookupFromSettings, lookupMissing, lookupToSettings, refTableColumns } from './lookup-logic';
import type { LookupValues, NoMatch } from './lookup-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Lookup / Join: where to look up, which columns match, which columns to bring, and what to do when nothing matches. */
export function LookupForm(props: FormProps) {
  const { step, definition, onSettings, readOnly, context } = props;
  const [v, setV] = useState<LookupValues>(() => lookupFromSettings(step.settings));
  const left = useSourceColumns(props, 'left');
  const right = useSourceColumns(props, 'right');
  const rightConnected = resolvedEdges(definition).some((e) => e.target === step.id && e.targetHandle === 'right');

  const apply = (next: LookupValues): void => {
    setV(next);
    onSettings(lookupToSettings(next, step.settings));
  };
  const leftNames = left.columns ? left.columns.map((c) => c.name) : null;
  const rightNames = v.source.kind === 'reference' ? refTableColumns(context.refTables, v.source.table) : right.columns ? right.columns.map((c) => c.name) : null;
  const sourceValue = v.source.kind === 'reference' ? `ref:${v.source.table}` : 'node';
  const tableOptions = context.refTables.map((x) => ({ value: `ref:${x.name}`, label: t.sourceTable(x.name) }));
  if (v.source.kind === 'reference' && !tableOptions.some((o) => o.value === sourceValue)) tableOptions.push({ value: sourceValue, label: t.sourceTable(v.source.table) });
  const missing = lookupMissing(v, rightConnected);

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <div>
        <SectionLabel label={t.source} hint={v.source.kind === 'node' ? t.nodeHint : undefined} />
        <Dropdown
          label={t.source}
          options={[{ value: 'node', label: t.sourceNode }, ...tableOptions]}
          value={sourceValue}
          disabled={readOnly}
          width={338}
          onChange={(value) => apply({ ...v, source: value === 'node' ? { kind: 'node' } : { kind: 'reference', table: value.slice(4) } })}
        />
      </div>

      <div className={styles.toolbar}>
        <LoadColumnsBar source={left} label={t.loadLeft} />
        {v.source.kind === 'node' ? <LoadColumnsBar source={right} label={t.loadRight} /> : null}
      </div>

      <div role="group" aria-label={t.keys} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t.keys} hint={t.keysHint} flush />
        {v.keys.map((k, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <ColumnSelect label={t.keyLeft} value={k.left} columns={leftNames} disabled={readOnly} width={132} onChange={(x) => apply({ ...v, keys: v.keys.map((y, j) => (j === i ? { ...y, left: x } : y)) })} />
              <ColumnSelect label={t.keyRight} value={k.right} columns={rightNames} disabled={readOnly} width={132} onChange={(x) => apply({ ...v, keys: v.keys.map((y, j) => (j === i ? { ...y, right: x } : y)) })} />
              <Button compact disabled={readOnly} aria-label={t.removeKey(i + 1)} onClick={() => apply({ ...v, keys: v.keys.filter((_, j) => j !== i) })}>
                <Icon name="close" />
              </Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, keys: [...v.keys, { left: '', right: '' }] })}>
            {t.addKey}
          </Button>
        </div>
      </div>

      <div role="group" aria-label={t.bring} style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={styles.label} style={{ marginBottom: 0 }}>{t.bring}</span>
        {v.bring.map((b, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <ColumnSelect label={t.bringColumn} value={b.column} columns={rightNames} disabled={readOnly} width={132} onChange={(x) => apply({ ...v, bring: v.bring.map((y, j) => (j === i ? { ...y, column: x } : y)) })} />
              <div className={styles.grow}>
                <Field label={t.bringAs} value={b.as} placeholder={b.column} disabled={readOnly} onChange={(e) => apply({ ...v, bring: v.bring.map((y, j) => (j === i ? { ...y, as: e.target.value } : y)) })} />
              </div>
              <Button compact disabled={readOnly} aria-label={t.removeBring(i + 1)} onClick={() => apply({ ...v, bring: v.bring.filter((_, j) => j !== i) })}>
                <Icon name="close" />
              </Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button compact disabled={readOnly} onClick={() => apply({ ...v, bring: [...v.bring, { column: '', as: '' }] })}>
            {t.addBring}
          </Button>
        </div>
      </div>

      <div>
        <span className={styles.label}>{t.onNoMatch}</span>
        <Dropdown
          label={t.onNoMatch}
          options={NO_MATCH.map((n) => ({ value: n, label: t.noMatchOptions[n] }))}
          value={v.onNoMatch}
          disabled={readOnly}
          width={338}
          onChange={(n) => apply({ ...v, onNoMatch: n as NoMatch })}
        />
      </div>

      <p className={styles.note} role="status">
        {missing.length === 0 ? t.complete : `${t.stillMissing} ${missing.join(' ')}`}
      </p>
    </div>
  );
}
