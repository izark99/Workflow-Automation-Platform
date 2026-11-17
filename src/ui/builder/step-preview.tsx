import { useEffect, useRef, useState } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import type { FileSource } from '../../engine/input/load';
import { checkFileSize } from '../../engine/size-guard';
import { EngineError } from '../../engine/types';
import type { Cell } from '../../engine/types';
import type { RefTable } from '../../engine/versions';
import { Button, Chip, ChipGroup, DatePicker, EmptyState, ErrorState, SkeletonTable, Table } from '../components';
import type { Column } from '../components';
import { previewStrings as t, strings } from '../strings';
import { todayIso } from '../screens/flows-logic';
import { formatCell, neededFiles, previewKey, previewTarget } from './preview-logic';
import { runPreview } from './preview-runner';
import type { PreviewData } from './preview-runner';
import styles from './step-preview.module.css';

export interface StepPreviewProps {
  definition: FlowDefinition;
  step: FlowNode;
  /** Test files by input key. Held by the builder screen, so they stay while another step is selected. */
  files: Record<string, File>;
  onFile: (key: string, file: File) => void;
  refTables: RefTable[];
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: PreviewData; key: string } | { status: 'error'; message: string };

const asSource = (f: File): FileSource => ({ name: f.name, size: f.size, blob: f });

/** The Test tab: effective date, test files, and the first rows of the step, run in this browser. */
export function StepPreview({ definition, step, files, onFile, refTables }: StepPreviewProps) {
  const [date, setDate] = useState(todayIso());
  const [handle, setHandle] = useState<string | undefined>(undefined);
  const [state, setState] = useState<State>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const target = previewTarget(definition, step, handle);

  // Leaving the step or the tab cancels a running preview and forgets its rows.
  useEffect(() => () => abort.current?.abort(), []);

  if (target.kind === 'needs_input') return <ErrorState what={t.failed} next={target.message} />;

  const needed = neededFiles(target.definition);
  const missing = needed.filter((n) => !files[n.key]);
  const key = previewKey(target.definition, target.nodeId, target.handle, date);

  const run = async (): Promise<void> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'loading' });
    try {
      const sources: Record<string, FileSource> = {};
      for (const n of needed) {
        const f = files[n.key];
        if (!f) continue;
        const guard = checkFileSize(f);
        if (!guard.ok) throw new EngineError('file_too_large', strings.xlsxTooLarge(f.name, guard.sizeBytes, guard.limitBytes));
        sources[n.key] = asSource(f);
      }
      const data = await runPreview({ definition: target.definition, nodeId: target.nodeId, handle: target.handle, files: sources, refTables, effectiveDate: date, signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'ready', data, key });
    } catch (e) {
      if (!controller.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const columns: Column<PreviewRow>[] = state.status === 'ready' ? previewColumns(state.data) : [];
  const rows: PreviewRow[] = state.status === 'ready' ? state.data.rows.map((cells, i) => ({ i, cells })) : [];

  return (
    <div className={styles.block} style={{ gap: 16 }}>
      <div className={styles.block}>
        <span className={styles.label}>{t.date}</span>
        <DatePicker label={t.date} value={date} onChange={setDate} width={338} />
      </div>
      {needed.length > 0 ? (
        <div className={styles.block}>
          <span className={styles.label}>{t.filesTitle}</span>
          <span className={styles.muted}>{t.filesHint}</span>
          {needed.map((n) => (
            <FileRow key={n.stepId} label={n.label} file={files[n.key]} onFile={(f) => onFile(n.key, f)} />
          ))}
        </div>
      ) : null}
      {target.handles.length > 1 ? (
        <div className={styles.block}>
          <span className={styles.label}>{t.output}</span>
          <ChipGroup label={t.output}>
            {target.handles.map((h) => (
              <Chip key={h} pressed={h === target.handle} onClick={() => setHandle(h)}>
                {h === 'nomatch' ? 'No match' : h === 'match' ? 'Match' : h}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}
      <div>
        <Button variant="primary" busy={state.status === 'loading'} disabled={missing.length > 0} onClick={() => void run()}>
          {state.status === 'loading' ? t.busy : t.button}
        </Button>
      </div>
      {missing.length > 0 && state.status === 'idle' ? <EmptyState title={t.empty} text={t.emptyText} action={null} /> : null}
      {state.status === 'loading' ? <SkeletonTable weights={[1, 1, 1]} rows={3} label={t.loading} /> : null}
      {state.status === 'error' ? <ErrorState what={t.failed} next={state.message} /> : null}
      {state.status === 'ready' ? (
        <div className={styles.block}>
          {state.key !== key ? <p className={styles.muted} role="status">{t.stale}</p> : null}
          <span className={styles.muted}>{state.data.totalRows === 0 ? t.noRows : t.showing(state.data.rows.length, state.data.totalRows)}</span>
          {state.data.rows.length > 0 ? (
            <div className={styles.result}>
              <Table label={t.table} columns={columns} rows={rows} rowKey={(r) => String(r.i)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface PreviewRow {
  i: number;
  cells: Cell[];
}

function previewColumns(data: PreviewData): Column<PreviewRow>[] {
  return data.columns.map((c, i) => ({
    key: `${i}-${c.name}`,
    header: c.name,
    align: c.type === 'number' ? ('right' as const) : ('left' as const),
    render: (row: PreviewRow) => formatCell(row.cells[i] ?? null, c.type),
  }));
}

function FileRow({ label, file, onFile }: { label: string; file: File | undefined; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileName}>
        <b>{label}</b>: {file ? file.name : t.notChosen}
      </span>
      {/* The native file input stays hidden behind the button (DESIGN: a hidden input[type=file] is allowed). */}
      <input
        ref={input}
        type="file"
        hidden
        accept=".xlsx,.xlsm,.csv"
        aria-label={`${t.choose}: ${label}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button compact aria-label={`${file ? t.change : t.choose}: ${label}`} onClick={() => input.current?.click()}>
        {file ? t.change : t.choose}
      </Button>
    </div>
  );
}
