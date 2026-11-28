import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { previewPages } from '../../engine/output/print/preview-model';
import type { PreviewPage } from '../../engine/output/print/preview-model';
import type { PrintLanguage } from '../../engine/output/print/language';
import type { PrintSettings } from '../../engine/output/print/settings';
import type { TokenContext } from '../../engine/output/print/tokens';
import { Button, Dialog, Icon } from '../components';
import { useT } from '../i18n';
import { previewTableData } from './preview-logic';
import type { PreviewData } from './preview-runner';
import styles from './print-preview.module.css';

export interface PrintPreviewProps {
  stepName: string;
  print: PrintSettings;
  tokens: Omit<TokenContext, 'rows'>;
  language: PrintLanguage;
  /** The first rows and the last rows of the table, when they were loaded. */
  first: PreviewData | undefined;
  last: PreviewData | undefined;
  /** The columns of the table are known but the rows are not yet: the preview was not run. */
  stale: boolean;
  large: boolean;
  onOpenLarge: () => void;
  onCloseLarge: () => void;
}

const SIZE_EM = { normal: 1, large: 1.35, xlarge: 1.7 } as const;

/** One page drawn from the model: the lines, the table, the signature block, the footer. It is a drawing, not the file. */
function PageBox({ page, rows: maxRows, label }: { page: PreviewPage; rows: number; label: string }) {
  // A page that has only the tail of the table (the last page) is drawn from its end; the others from their start.
  const cut = page.rows.length > maxRows;
  const tail = page.gapBefore;
  const shown = cut ? (tail ? page.rows.slice(-maxRows) : page.rows.slice(0, maxRows)) : page.rows;
  const columns = page.header?.length ?? shown[0]?.length ?? 1;
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` };
  return (
    <div className={styles.page} data-drawing="print-page" role="img" aria-label={label} style={{ aspectRatio: String(page.ratio) }}>
      <div className={styles.content} aria-hidden="true">
        {page.lines.map((l, i) => (
          <div key={i} className={styles.line} data-user-content style={{ textAlign: l.align, fontWeight: l.bold ? 700 : 400, fontSize: `${SIZE_EM[l.size]}em` }}>
            {l.text || ' '}
          </div>
        ))}
        {page.lines.length > 0 ? <div className={styles.spacer} /> : null}
        {page.header ? (
          <div className={`${styles.row} ${styles.head}`} style={grid}>
            {page.header.map((h, i) => <span key={i} data-user-content>{h}</span>)}
          </div>
        ) : null}
        {page.gapBefore || (cut && tail) ? <div className={styles.gap}>⋮</div> : null}
        {shown.map((r, i) => (
          <div key={i} className={styles.row} style={grid}>
            {r.map((c, j) => <span key={j} data-user-content>{c}</span>)}
          </div>
        ))}
        {page.gapAfter || (cut && !tail) ? <div className={styles.gap}>⋮</div> : null}
        {page.signature ? (
          <div className={styles.signature}>
            {page.signature.dateLine ? <div className={styles.dateLine} data-user-content>{page.signature.dateLine}</div> : null}
            <div className={styles.signers} style={{ gridTemplateColumns: `repeat(${page.signature.signers.length}, minmax(0, 1fr))` }}>
              {page.signature.signers.map((s, i) => (
                <div key={i} className={styles.signer} data-user-content>
                  <b>{s.title}</b>
                  <i>{s.line}</i>
                  <span className={styles.sign} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {page.footer ? <div className={styles.footer} data-user-content>{page.footer}</div> : null}
      </div>
    </div>
  );
}

/** The print preview of the Test tab (SPEC 16.1 item 8): the first page and the last page, side by side, marked as approximate. */
export function PrintPreview({ stepName, print, tokens, language, first, last, stale, large, onOpenLarge, onCloseLarge }: PrintPreviewProps) {
  const t = useT();
  const base = first ?? last;
  const model = useMemo(() => {
    if (!base) return null;
    const total = base.totalRows;
    // A table that was loaded whole is both its first rows and its last rows.
    const firstData = first ?? (last && total <= last.rows.length ? last : undefined);
    const lastData = last ?? (first && total <= first.rows.length ? first : undefined);
    return previewPages({
      print,
      tokens: { ...tokens, rows: total },
      language,
      columns: base.columns.map((c) => c.name),
      firstRows: firstData ? previewTableData(firstData).rows : [],
      lastRows: lastData ? previewTableData(lastData).rows : [],
      totalRows: total,
    });
  }, [base, first, last, print, tokens, language]);

  const body = (rows: number) =>
    model ? (
      <div className={styles.pages}>
        <figure className={styles.figure}>
          <PageBox page={model.first} rows={rows} label={t('builder.printPreview.pageLabel', { n: 1, total: model.pages })} />
          <figcaption>{t('builder.printPreview.first')}</figcaption>
        </figure>
        {model.last ? (
          <figure className={styles.figure}>
            <PageBox page={model.last} rows={rows} label={t('builder.printPreview.pageLabel', { n: model.last.number, total: model.pages })} />
            <figcaption>{t('builder.printPreview.last')}</figcaption>
          </figure>
        ) : null}
      </div>
    ) : null;

  return (
    <section className={styles.block} aria-label={t('builder.printPreview.title')}>
      <div className={styles.titleRow}>
        <strong>{t('builder.printPreview.title')}</strong>
        {model ? (
          <Button size="sm" icon data-open-large aria-label={t('builder.printPreview.openLarge')} onClick={onOpenLarge}>
            <Icon name="maximize" />
          </Button>
        ) : null}
      </div>
      {model ? (
        <>
          {stale ? <p className={styles.note} role="status">{t('builder.preview.stale')}</p> : null}
          {body(10)}
          <p className={styles.note}>{model.last ? t('builder.printPreview.approx') : t('builder.printPreview.onePage')}</p>
        </>
      ) : (
        <p className={styles.note}>{t('builder.printPreview.noRows')}</p>
      )}
      {large && model ? (
        <Dialog wide title={t('builder.printPreview.popupTitle', { step: stepName })} onClose={onCloseLarge} actions={<Button onClick={onCloseLarge}>{t('builder.preview.close')}</Button>}>
          <div className={styles.largePages} role="region" tabIndex={0} aria-label={t('builder.printPreview.title')}>{body(30)}</div>
          <p className={styles.note}>{t('builder.printPreview.approx')}</p>
        </Dialog>
      ) : null}
    </section>
  );
}
