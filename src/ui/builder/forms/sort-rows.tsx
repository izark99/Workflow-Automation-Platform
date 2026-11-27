import { Button, Dropdown, Field, Icon } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ColumnSelect, SectionLabel } from './column-pickers';
import { emptySortRow } from './sort-logic';
import type { SortRow } from './sort-logic';
import styles from './column-pickers.module.css';

export interface SortRowsProps {
  rows: SortRow[];
  /** The names of the columns of the input, or null while they are not known. */
  names: string[] | null;
  readOnly: boolean;
  onChange: (rows: SortRow[]) => void;
}

/** The list of sort keys: a column or a formula, a direction, a remove button, and "Add sort key". */
export function SortRows({ rows, names, readOnly, onChange }: SortRowsProps) {
  const t = useT();
  const patch = (i: number, change: Partial<SortRow>): void => onChange(rows.map((k, j) => (j === i ? { ...k, ...change } : k)));
  return (
    <div role="group" aria-label={t('builder.output.sort')} style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionLabel label={t('builder.output.sort')} hint={t('builder.output.sortHint')} flush />
      {rows.map((k, i) => (
        <div key={i} className={styles.rowCard}>
          <div className={styles.line}>
            <div>
              <span className={styles.label}>{t('common.numbered', { label: t('builder.output.kind'), n: i + 1 })}</span>
              <Dropdown label={t('common.numbered', { label: t('builder.output.kind'), n: i + 1 })} options={(['column', 'formula'] as const).map((x) => ({ value: x, label: t(`builder.output.kinds.${x}` as MessageKey) }))} value={k.kind} disabled={readOnly} width={110} onChange={(kind) => patch(i, { kind: kind as SortRow['kind'] })} />
            </div>
            <div className={styles.grow}>
              {k.kind === 'column' ? (
                <ColumnSelect label={t('common.numbered', { label: t('builder.output.sortColumn'), n: i + 1 })} value={k.column} columns={names} disabled={readOnly} onChange={(column) => patch(i, { column })} />
              ) : (
                <Field label={t('common.numbered', { label: t('builder.output.sortFormula'), n: i + 1 })} value={k.expression} disabled={readOnly} onChange={(e) => patch(i, { expression: e.target.value })} />
              )}
            </div>
            <Button icon disabled={readOnly} aria-label={t('builder.output.removeSort', { n: i + 1 })} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Icon name="x" />
            </Button>
          </div>
          <div>
            <span className={styles.label}>{t('common.numbered', { label: t('builder.output.direction'), n: i + 1 })}</span>
            <Dropdown label={t('common.numbered', { label: t('builder.output.direction'), n: i + 1 })} options={(['asc', 'desc'] as const).map((x) => ({ value: x, label: t(`builder.output.directions.${x}` as MessageKey) }))} value={k.direction} disabled={readOnly} width={150} onChange={(direction) => patch(i, { direction: direction as SortRow['direction'] })} />
          </div>
        </div>
      ))}
      <div style={{ paddingTop: 8 }}>
        <Button size="sm" disabled={readOnly} onClick={() => onChange([...rows, emptySortRow()])}>
          {t('builder.output.addSort')}
        </Button>
      </div>
    </div>
  );
}
