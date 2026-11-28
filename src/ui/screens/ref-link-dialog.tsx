import { useMemo, useState } from 'react';
import { Button, Dialog, Dropdown, ErrorState, Field } from '../components';
import { useT } from '../i18n';
import type { RefTableView } from '../../store/types';
import { columnsOfTable, linkCandidates, linkPreview } from './ref-link-logic';
import styles from './reference-tables.module.css';

export interface LinkChoice {
  sourceId: string;
  column: string;
  keyColumn: string;
}

/** The three controls of a link: the table, its column, the key column of this table, and the line that says what the link adds. */
export function LinkControls({ tables, table, value, onChange, today, defaultKey }: { tables: readonly RefTableView[]; table: RefTableView | null; value: LinkChoice; onChange: (v: LinkChoice) => void; today: string; defaultKey?: string }) {
  const t = useT();
  const { allowed, cyclic } = useMemo(() => linkCandidates(tables, table?.id ?? null), [tables, table]);
  const source = allowed.find((a) => a.id === value.sourceId);
  const columns = source ? columnsOfTable(source) : [];
  const preview = source && value.column ? linkPreview(source, value.column, table, value.keyColumn, today) : null;
  const pickSource = (id: string): void => {
    const a = allowed.find((x) => x.id === id);
    const first = a ? (columnsOfTable(a)[0]?.name ?? '') : '';
    onChange({ sourceId: id, column: first, keyColumn: value.keyColumn === '' || value.keyColumn === value.column ? first : value.keyColumn });
  };
  if (allowed.length === 0) {
    return (
      <>
        <p className={styles.note} role="status">{t('refTables.link.noTables')}</p>
        {cyclic.length > 0 ? <p className={styles.note}>{t('refTables.link.cycle', { names: cyclic.map((c) => c.name).join(', ') })}</p> : null}
      </>
    );
  }
  return (
    <>
      <div>
        <span className={styles.fieldLabel}>{t('refTables.link.table')}</span>
        <Dropdown label={t('refTables.link.table')} options={[{ value: '', label: t('refTables.link.choose') }, ...allowed.map((a) => ({ value: a.id, label: a.name }))]} value={value.sourceId} width="100%" userContent onChange={pickSource} />
      </div>
      {cyclic.length > 0 ? <p className={styles.note}>{t('refTables.link.cycle', { names: cyclic.map((c) => c.name).join(', ') })}</p> : null}
      {source && columns.length === 0 ? <p className={styles.note} role="status">{t('refTables.link.noColumn')}</p> : null}
      {source && columns.length > 0 ? (
        <div>
          <span className={styles.fieldLabel}>{t('refTables.link.column')}</span>
          <Dropdown label={t('refTables.link.column')} options={columns.map((c) => ({ value: c.name, label: c.name }))} value={value.column} width="100%" userContent onChange={(column) => onChange({ ...value, column, keyColumn: value.keyColumn === '' || value.keyColumn === value.column ? column : value.keyColumn })} />
        </div>
      ) : null}
      {source && columns.length > 0 ? <Field label={t('refTables.link.key')} hint={t('refTables.link.keyHint')} value={value.keyColumn} placeholder={defaultKey} onChange={(e) => onChange({ ...value, keyColumn: e.target.value })} /> : null}
      {preview ? (
        <p className={styles.note} role="status">
          {!preview.hasVersion ? t('refTables.link.noPublished') : preview.added === 0 ? t('refTables.link.countNone') : t('refTables.link.count', { n: preview.added, nText: preview.added.toLocaleString('en-US') })}
        </p>
      ) : null}
    </>
  );
}

/** The dialog "Link to a table" of the More menu (420 px): the three controls and the buttons Cancel and Link. */
export function LinkDialog({ tables, table, today, busy, error, onLink, onCancel }: { tables: readonly RefTableView[]; table: RefTableView; today: string; busy: boolean; error: string | null; onLink: (v: LinkChoice) => void; onCancel: () => void }) {
  const t = useT();
  const [value, setValue] = useState<LinkChoice>({ sourceId: '', column: '', keyColumn: '' });
  const ready = value.sourceId !== '' && value.column !== '' && value.keyColumn.trim() !== '';
  return (
    <Dialog
      title={t('refTables.link.title', { name: table.name })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('refTables.cancel')}</Button>
          <Button variant="primary" busy={busy} disabled={!ready} onClick={() => onLink({ ...value, keyColumn: value.keyColumn.trim() })}>
            {t('refTables.link.confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <LinkControls tables={tables} table={table} value={value} onChange={setValue} today={today} />
        {error ? <ErrorState what={t('refTables.link.failed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}
