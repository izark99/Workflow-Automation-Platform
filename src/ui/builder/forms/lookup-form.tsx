import { useState } from 'react';
import { resolvedEdges } from '../graph';
import { Button, Dropdown, Field, Icon } from '../../components';
import { useT } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import type { MessageKey } from '../../i18n';
import { ColumnSelect, LoadColumnsBar, SectionLabel } from './column-pickers';
import { NO_MATCH, lookupFromSettings, lookupMissing, lookupToSettings, refTableColumns, refTableUnreadable } from './lookup-logic';
import type { LookupValues, NoMatch } from './lookup-logic';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Lookup / Join: where to look up, which columns match, which columns to bring, and what to do when nothing matches. */
export function LookupForm(props: FormProps) {
  const t = useT();
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
  const tableOptions = context.refTables.map((x) => ({ value: `ref:${x.name}`, label: t('builder.join.sourceTable', { name: x.name }) }));
  if (v.source.kind === 'reference' && !tableOptions.some((o) => o.value === sourceValue)) tableOptions.push({ value: sourceValue, label: t('builder.join.sourceTable', { name: v.source.table }) });
  const missing = lookupMissing(v, rightConnected);

  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <div>
        <SectionLabel label={t('builder.join.source')} hint={v.source.kind === 'node' ? t('builder.join.nodeHint') : undefined} />
        <Dropdown
          label={t('builder.join.source')}
          options={[{ value: 'node', label: t('builder.join.sourceNode') }, ...tableOptions]}
          value={sourceValue}
          disabled={readOnly}
          width="100%"
          onChange={(value) => apply({ ...v, source: value === 'node' ? { kind: 'node' } : { kind: 'reference', table: value.slice(4) } })}
        />
        {v.source.kind === 'reference' && refTableUnreadable(context.refTables, v.source.table) ? (
          <p className={styles.note} role="status">
            {t('builder.join.refUnreadable')}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <LoadColumnsBar source={left} label={t('builder.join.loadLeft')} />
        {v.source.kind === 'node' ? <LoadColumnsBar source={right} label={t('builder.join.loadRight')} /> : null}
      </div>

      <div role="group" aria-label={t('builder.join.keys')} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t('builder.join.keys')} hint={t('builder.join.keysHint')} flush />
        {v.keys.map((k, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <ColumnSelect label={t('builder.join.keyLeft')} value={k.left} columns={leftNames} disabled={readOnly} onChange={(x) => apply({ ...v, keys: v.keys.map((y, j) => (j === i ? { ...y, left: x } : y)) })} />
              <ColumnSelect label={t('builder.join.keyRight')} value={k.right} columns={rightNames} disabled={readOnly} onChange={(x) => apply({ ...v, keys: v.keys.map((y, j) => (j === i ? { ...y, right: x } : y)) })} />
              <Button icon disabled={readOnly} aria-label={t('builder.join.removeKey', { n: i + 1 })} onClick={() => apply({ ...v, keys: v.keys.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button size="sm" disabled={readOnly} onClick={() => apply({ ...v, keys: [...v.keys, { left: '', right: '' }] })}>
            {t('builder.join.addKey')}
          </Button>
        </div>
      </div>

      <div role="group" aria-label={t('builder.join.bring')} style={{ display: 'flex', flexDirection: 'column' }}>
        <span className={styles.label} style={{ marginBottom: 0 }}>{t('builder.join.bring')}</span>
        {v.bring.map((b, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <ColumnSelect label={t('builder.join.bringColumn')} value={b.column} columns={rightNames} disabled={readOnly} onChange={(x) => apply({ ...v, bring: v.bring.map((y, j) => (j === i ? { ...y, column: x } : y)) })} />
              <div className={styles.grow}>
                <Field label={t('builder.join.bringAs')} value={b.as} placeholder={b.column} disabled={readOnly} onChange={(e) => apply({ ...v, bring: v.bring.map((y, j) => (j === i ? { ...y, as: e.target.value } : y)) })} />
              </div>
              <Button icon disabled={readOnly} aria-label={t('builder.join.removeBring', { n: i + 1 })} onClick={() => apply({ ...v, bring: v.bring.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button size="sm" disabled={readOnly} onClick={() => apply({ ...v, bring: [...v.bring, { column: '', as: '' }] })}>
            {t('builder.join.addBring')}
          </Button>
        </div>
      </div>

      <Bind name="onNoMatch" label={t('builder.join.onNoMatch')}>
      <div>
        <span className={styles.label}>{t('builder.join.onNoMatch')}</span>
        <Dropdown
          label={t('builder.join.onNoMatch')}
          options={NO_MATCH.map((n) => ({ value: n, label: t(`builder.join.noMatchOptions.${n}` as MessageKey) }))}
          value={v.onNoMatch}
          disabled={readOnly}
          width="100%"
          onChange={(n) => apply({ ...v, onNoMatch: n as NoMatch })}
        />
      </div>
      </Bind>

      <p className={styles.note} role="status">
        {missing.length === 0 ? t('builder.join.complete') : t('common.numbered', { label: t('builder.join.stillMissing'), n: missing.join(' ') })}
      </p>
    </div>
  );
}
