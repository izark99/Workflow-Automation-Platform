import { useMemo, useState } from 'react';
import { Button, Chip, ChipGroup, Dialog, ErrorState, PreviewTable, SearchField, SkeletonTable } from '../components';
import { useT } from '../i18n';
import { findRows, previewTableData } from './preview-logic';
import { MAX_PREVIEW_ROWS } from './preview-runner';
import type { PreviewData, PreviewPart } from './preview-runner';
import styles from './step-preview.module.css';

export type PopupState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: PreviewData; stale: boolean } | { status: 'error'; message: string };

export interface PreviewDialogProps {
  /** The name of the step, for the title. */
  stepName: string;
  state: PopupState;
  onClose: () => void;
  /** Runs the preview again for the first or the last rows. */
  onPart: (part: PreviewPart) => void;
  /** Runs the preview again with up to 1,000 rows. */
  onShowMore: () => void;
}

const num = (n: number): string => n.toLocaleString('en-US');

/** The preview in a large popup (SPEC 15.3): First and Last rows, Find over the loaded rows, Show more, the table with row numbers. */
export function PreviewDialog({ stepName, state, onClose, onPart, onShowMore }: PreviewDialogProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  // The part that is shown or loading: the state forgets it while it loads.
  const [part, setPart] = useState<PreviewPart>(state.status === 'ready' ? state.data.part : 'first');
  const table = useMemo(() => (state.status === 'ready' ? previewTableData(state.data) : null), [state]);
  const kept = useMemo(() => (table ? findRows(table.rows, query) : []), [table, query]);
  const data = state.status === 'ready' ? state.data : null;
  const filtering = query.trim() !== '';
  const canLoadMore = !!data && data.rows.length < Math.min(data.totalRows, MAX_PREVIEW_ROWS);
  const choose = (p: PreviewPart): void => {
    setPart(p);
    onPart(p);
  };

  return (
    <Dialog wide title={t('builder.preview.popupTitle', { step: stepName })} onClose={onClose} actions={<Button onClick={onClose}>{t('builder.preview.close')}</Button>}>
      <div className={styles.popupBar}>
        <ChipGroup label={t('builder.preview.output')}>
          <Chip pressed={part === 'first'} onClick={() => choose('first')}>
            {t('builder.preview.firstRows')}
          </Chip>
          <Chip pressed={part === 'last'} onClick={() => choose('last')}>
            {t('builder.preview.lastRows')}
          </Chip>
        </ChipGroup>
        <SearchField label={t('builder.preview.find')} value={query} onChange={(e) => setQuery(e.target.value)} disabled={!data} />
        <span className={styles.muted} role="status">
          {data && filtering ? t('builder.preview.findCount', { n: num(kept.length), total: data.rows.length }) : ''}
        </span>
        <Button size="sm" disabled={!canLoadMore} onClick={onShowMore}>
          {t('builder.preview.showMore')}
        </Button>
      </div>
      {state.status === 'ready' && state.stale ? <p className={styles.muted} role="status">{t('builder.preview.stale')}</p> : null}
      {state.status === 'loading' || state.status === 'idle' ? <SkeletonTable weights={[1, 1, 1]} rows={6} label={t('builder.preview.loading')} /> : null}
      {state.status === 'error' ? <ErrorState what={t('builder.preview.failed')} next={state.message} /> : null}
      {data && table && data.rows.length === 0 ? <p className={styles.muted}>{t('builder.preview.noRows')}</p> : null}
      {data && table && data.rows.length > 0 && kept.length === 0 ? <p className={styles.muted} role="status">{t('builder.preview.findNone')}</p> : null}
      {data && table && kept.length > 0 ? (
        <PreviewTable fill rowNumbers label={t('builder.preview.table')} columns={table.columns} rows={kept.map((i) => table.rows[i] ?? [])} numbers={kept.map((i) => data.fromRow + i)} />
      ) : null}
      {data && data.rows.length > 0 ? (
        <span className={styles.muted}>
          {data.totalRows > data.rows.length
            ? data.part === 'last'
              ? t('builder.preview.showingLast', { shown: num(data.rows.length), total: num(data.totalRows), from: num(data.fromRow) })
              : t('builder.preview.showing', { shown: num(data.rows.length), total: num(data.totalRows) })
            : t('builder.preview.rowCount', { total: data.totalRows, totalText: num(data.totalRows) })}
        </span>
      ) : null}
    </Dialog>
  );
}
