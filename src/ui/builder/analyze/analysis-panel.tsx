import { useRef, useState } from 'react';
import { columnLetters } from '../../../engine/input/region';
import type { Grid } from '../../../engine/refimport/types';
import { Badge, Button, ErrorState, Icon, InfoTip, ProgressBar, Table } from '../../components';
import type { Column } from '../../components';
import { errorText, translate, useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { analyzeFile, applyProposal } from './analyze-file';
import type { FileAnalysis } from './analyze-file';
import { proposalLines } from './proposal-lines';
import styles from './analysis-panel.module.css';

type State = { status: 'idle' } | { status: 'reading'; done: number; total: number } | { status: 'done'; result: FileAnalysis } | { status: 'failed'; message: string };

/** The rows and columns of the preview: the first 30 rows of the sheet, and the first columns. */
const PREVIEW_ROWS = 30;
const PREVIEW_COLUMNS = 8;

interface PreviewRow {
  /** 1-based row of the sheet. */
  n: number;
  cells: string[];
  /** Inside the region (the header row and the rows of the table): read. Outside it: left out. */
  read: boolean;
  header: boolean;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

function previewRows(grid: Grid, result: FileAnalysis): PreviewRow[] {
  const region = result.analysis.region;
  return grid.rows.slice(0, PREVIEW_ROWS).map((row, i) => ({
    n: i + 1,
    cells: Array.from({ length: PREVIEW_COLUMNS }, (_, c) => cellText(row[c])),
    read: region !== undefined && i + 1 >= region.headerRow && i + 1 <= region.lastRow,
    header: region !== undefined && i + 1 === region.headerRow,
  }));
}

/** "Left out": the rows that the step will not read, and the other tables that were found. */
function leftOutLines(result: FileAnalysis): string[] {
  const { leftOut, otherTables } = result.analysis;
  const out: string[] = [];
  if (leftOut.title) out.push(translate('builder.analyze.leftOutTitle', { from: leftOut.title[0], to: leftOut.title[1] }));
  if (leftOut.footer) out.push(translate('builder.analyze.leftOutFooter', { from: leftOut.footer[0], to: leftOut.footer[1] }));
  for (const o of otherTables) out.push(translate('builder.analyze.leftOutOther', { from: o.headerRow, to: o.lastRow, first: columnLetters(o.firstColumn), last: columnLetters(o.lastColumn) }));
  return out;
}

/**
 * In the development and test builds a delay (ms) in the localStorage key `dfw.analyzeDelayMs` keeps the panel in its reading
 * state, so that the UI rules can check it. It is never read in the release build.
 */
function testDelayMs(): number {
  if (!(import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true')) return 0;
  try {
    return Number(localStorage.getItem('dfw.analyzeDelayMs') ?? 0) || 0;
  } catch {
    return 0;
  }
}

export interface AnalysisPanelProps {
  /** The test file of the step, or undefined when none is chosen. */
  file: File | undefined;
  /** The settings of the step now. */
  settings: Record<string, unknown>;
  /** Called with the settings after the proposal is applied. The caller saves them and shows the Configure tab. */
  onApply: (settings: Record<string, unknown>) => void;
}

/**
 * "Analyze file" on the Test tab of an Input step (SPEC 13.2 item 3, DESIGN "Analyze file"). The file is read in the browser
 * only. The analysis proposes; nothing is applied until the person presses "Apply to the step".
 */
export function AnalysisPanel({ file, settings, onApply }: AnalysisPanelProps) {
  const t = useT();
  const [state, setState] = useState<State>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const run = async (): Promise<void> => {
    if (!file) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'reading', done: 0, total: 1 });
    try {
      const delay = testDelayMs();
      if (delay > 0) await new Promise<void>((resolve) => { const id = window.setTimeout(resolve, delay); controller.signal.addEventListener('abort', () => { window.clearTimeout(id); resolve(); }); });
      if (controller.signal.aborted) return;
      const result = await analyzeFile(file, { signal: controller.signal, onProgress: (done, total) => setState((s) => (s.status === 'reading' && !controller.signal.aborted ? { status: 'reading', done, total } : s)) });
      if (result === 'cancelled' || controller.signal.aborted) return;
      setState({ status: 'done', result });
    } catch (e) {
      if (!controller.signal.aborted) setState({ status: 'failed', message: errorText(e) });
    }
  };
  const cancel = (): void => {
    abort.current?.abort();
    setState({ status: 'idle' });
  };

  const columns: Column<PreviewRow>[] = [
    { key: 'n', header: t('builder.analyze.rowColumn'), align: 'right', userContent: false, render: (r) => (
      <span className={r.read ? undefined : styles.dim}>
        {r.n}
        {r.read ? null : <span className={styles.srOnly}>{t('builder.analyze.leftOutSr')}</span>}
      </span>
    ) },
    ...Array.from({ length: PREVIEW_COLUMNS }, (_, c): Column<PreviewRow> => ({
      key: `c${c}`,
      header: columnLetters(c + 1),
      userContent: true,
      render: (r) => <span className={`${r.read ? '' : styles.dim} ${r.header ? styles.header : ''}`}>{r.cells[c]}</span>,
    })),
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.bar}>
        <Button compact data-analyze="run" disabled={!file || state.status === 'reading'} onClick={() => void run()}>
          {t('builder.analyze.button')}
        </Button>
        <InfoTip label={t('builder.analyze.button')}>{t('builder.analyze.note')}</InfoTip>
      </div>
      {!file ? <p className={styles.note}>{t('builder.analyze.noFile')}</p> : null}
      {state.status === 'reading' ? (
        <div className={styles.panel}>
          <ProgressBar value={state.done} max={state.total} label={t('builder.analyze.reading')} />
          <div className={styles.bar}>
            <span className={styles.note} role="status">{t('builder.analyze.reading')}</span>
            <Button compact onClick={cancel}>{t('builder.analyze.cancel')}</Button>
          </div>
        </div>
      ) : null}
      {state.status === 'failed' ? <ErrorState what={t('builder.analyze.failed')} next={state.message} actions={<Button compact onClick={() => setState({ status: 'idle' })}>{t('builder.analyze.close')}</Button>} /> : null}
      {state.status === 'done' && !state.result.analysis.found ? (
        <div className={styles.result}>
          <p className={styles.note} role="status">{t('builder.analyze.noTable')}</p>
          <div className={styles.actions}>
            <Button compact onClick={() => setState({ status: 'idle' })}>{t('builder.analyze.close')}</Button>
          </div>
        </div>
      ) : null}
      {state.status === 'done' && state.result.analysis.found ? (
        <div className={styles.result} role="group" aria-label={t('builder.analyze.result')}>
          <ul className={styles.lines}>
            {proposalLines(state.result).map((l) => (
              <li key={l.id} className={styles.line}>
                <span className={styles.label}>{l.label}</span>
                <span className={`${styles.value} ${l.value === undefined ? styles.undecided : ''}`} data-user-content={l.value === undefined ? undefined : ''}>
                  {l.value === undefined ? t('builder.analyze.notDecided') : l.value}
                </span>
                {l.confidence ? (
                  <span className={styles.badges}>
                    <Badge tone={l.confidence === 'high' ? 'soft' : 'outline'}>
                      {l.confidence === 'low' ? <Icon name="alert" size={14} /> : null}
                      {t(`builder.analyze.confidence.${l.confidence}` as MessageKey)}
                    </Badge>
                    {l.reason ? <InfoTip label={l.label}>{l.reason}</InfoTip> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div>
            <h4 className={styles.sectionTitle}>{t('builder.analyze.leftOut')}</h4>
            {leftOutLines(state.result).length === 0 ? (
              <p className={styles.note}>{t('builder.analyze.leftOutNone')}</p>
            ) : (
              <ul className={styles.leftOut}>
                {leftOutLines(state.result).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          {state.result.analysis.truncated ? <p className={styles.note}>{t('builder.analyze.truncated')}</p> : null}
          <div className={styles.preview}>
            <Table label={t('builder.analyze.preview')} columns={columns} rows={previewRows(state.result.grid, state.result)} rowKey={(r) => String(r.n)} maxHeight={320} />
          </div>
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => {
                onApply(applyProposal(settings, state.result));
                setState({ status: 'idle' });
              }}
            >
              {t('builder.analyze.apply')}
            </Button>
            <Button onClick={() => setState({ status: 'idle' })}>{t('builder.analyze.close')}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
