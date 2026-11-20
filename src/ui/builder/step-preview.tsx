import { useEffect, useRef, useState } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import type { ParameterValue } from '../../engine/flow/parameters';
import { parametersUsedBy } from '../../engine/flow/parameters-used';
import type { FileSource } from '../../engine/input/load';
import { checkFileSize } from '../../engine/size-guard';
import { EngineError } from '../../engine/types';
import type { Cell } from '../../engine/types';
import type { RefTable } from '../../engine/versions';
import { Button, Chip, ChipGroup, DatePicker, EmptyState, ErrorState, InfoTip, SkeletonTable, Table } from '../components';
import type { Column } from '../components';
import { useT, errorText } from '../i18n';
import { ParameterInputs, PendingParametersNote } from '../parameter-inputs';
import { initialValues, parameterValueErrors } from '../parameter-logic';
import { formatCell, neededFiles, previewKey, previewTarget } from './preview-logic';
import { runPreview } from './preview-runner';
import type { PreviewData } from './preview-runner';
import styles from './step-preview.module.css';

export interface StepPreviewProps {
  /** The test date (ISO), kept by the builder so the forms can show what it selects. */
  date: string;
  onDate: (date: string) => void;
  definition: FlowDefinition;
  step: FlowNode;
  /** Test files by input key. Held by the builder screen, so they stay while another step is selected. */
  files: Record<string, File>;
  onFile: (key: string, file: File) => void;
  refTables: RefTable[];
  /** Test values of the parameters, by key. Held by the builder screen like the test files. */
  parameterValues: Record<string, ParameterValue | undefined>;
  onParameterValue: (key: string, value: ParameterValue | undefined) => void;
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: PreviewData; key: string } | { status: 'error'; message: string };

const asSource = (f: File): FileSource => ({ name: f.name, size: f.size, blob: f });

/** The Test tab: effective date, test files, and the first rows of the step, run in this browser. */
export function StepPreview({ definition, step, files, onFile, refTables, parameterValues, onParameterValue, date, onDate }: StepPreviewProps) {
  const t = useT();
  const [handle, setHandle] = useState<string | undefined>(undefined);
  const [state, setState] = useState<State>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const target = previewTarget(definition, step, handle);

  // Leaving the step or the tab cancels a running preview and forgets its rows.
  useEffect(() => () => abort.current?.abort(), []);

  if (target.kind === 'needs_input') return <ErrorState what={t('builder.preview.failed')} next={target.message} />;

  const needed = neededFiles(target.definition);
  const missing = needed.filter((n) => !files[n.key]);
  // Only the parameters that the steps up to this one read are asked for. The default fills a value that was not typed.
  const used = parametersUsedBy(target.definition);
  const values = initialValues(used, parameterValues);
  const valueErrors = parameterValueErrors(used, values);
  const invalid = Object.keys(valueErrors).length > 0;
  const key = previewKey(target.definition, target.nodeId, target.handle, date) + JSON.stringify(values);

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
        if (!guard.ok) throw new EngineError('file_too_large', t('engine.fileTooLarge', { fileName: f.name, size: megabytes(guard.sizeBytes), limit: megabytes(guard.limitBytes) }));
        sources[n.key] = asSource(f);
      }
      const data = await runPreview({ definition: target.definition, nodeId: target.nodeId, handle: target.handle, files: sources, refTables, effectiveDate: date, parameterValues: values, signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'ready', data, key });
    } catch (e) {
      if (!controller.signal.aborted) setState({ status: 'error', message: errorText(e) });
    }
  };

  const columns: Column<PreviewRow>[] = state.status === 'ready' ? previewColumns(state.data) : [];
  const rows: PreviewRow[] = state.status === 'ready' ? state.data.rows.map((cells, i) => ({ i, cells })) : [];

  return (
    <div className={styles.block} style={{ gap: 16 }}>
      <div className={styles.block}>
        <span className={styles.label}>{t('builder.preview.date')}</span>
        <DatePicker label={t('builder.preview.date')} value={date} onChange={onDate} width="100%" />
      </div>
      {used.length > 0 ? (
        <div className={styles.block}>
          <span className={styles.labelRow}>
            <span className={styles.label}>{t('builder.preview.paramsTitle')}</span>
            <InfoTip label={t('builder.preview.paramsTitle')}>{t('builder.preview.paramsHint')}</InfoTip>
          </span>
          <ParameterInputs parameters={used} values={values} errors={valueErrors} onChange={onParameterValue} />
          <PendingParametersNote parameters={used} errors={valueErrors} action="preview" />
        </div>
      ) : null}
      {needed.length > 0 ? (
        <div className={styles.block}>
          <span className={styles.labelRow}>
            <span className={styles.label}>{t('builder.preview.filesTitle')}</span>
            <InfoTip label={t('builder.preview.filesTitle')}>{t('builder.preview.filesHint')}</InfoTip>
          </span>
          {needed.map((n) => (
            <FileRow key={n.stepId} label={n.label} file={files[n.key]} onFile={(f) => onFile(n.key, f)} />
          ))}
        </div>
      ) : null}
      {target.handles.length > 1 ? (
        <div className={styles.block}>
          <span className={styles.label}>{t('builder.preview.output')}</span>
          <ChipGroup label={t('builder.preview.output')}>
            {target.handles.map((h) => (
              <Chip key={h} pressed={h === target.handle} onClick={() => setHandle(h)}>
                {h === 'nomatch' ? t('builder.preview.noMatch') : h === 'match' ? t('builder.preview.match') : h}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}
      <div>
        <Button variant="primary" busy={state.status === 'loading'} disabled={missing.length > 0 || invalid} onClick={() => void run()}>
          {state.status === 'loading' ? t('builder.preview.busy') : t('builder.preview.button')}
        </Button>
      </div>
      {missing.length > 0 && state.status === 'idle' ? <EmptyState title={t('builder.preview.empty')} text={t('builder.preview.emptyText')} action={null} /> : null}
      {state.status === 'loading' ? <SkeletonTable weights={[1, 1, 1]} rows={3} label={t('builder.preview.loading')} /> : null}
      {state.status === 'error' ? <ErrorState what={t('builder.preview.failed')} next={state.message} /> : null}
      {state.status === 'ready' ? (
        <div className={styles.block}>
          {state.key !== key ? <p className={styles.muted} role="status">{t('builder.preview.stale')}</p> : null}
          <span className={styles.muted}>{state.data.totalRows === 0 ? t('builder.preview.noRows') : (state.data.totalRows > state.data.rows.length ? t('builder.preview.showing', { shown: state.data.rows.length.toLocaleString('en-US'), total: state.data.totalRows.toLocaleString('en-US') }) : t('builder.preview.rowCount', { total: state.data.totalRows, totalText: state.data.totalRows.toLocaleString('en-US') }))}</span>
          {state.data.rows.length > 0 ? (
            <div className={styles.result}>
              <Table label={t('builder.preview.table')} columns={columns} rows={rows} rowKey={(r) => String(r.i)} />
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

const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

function previewColumns(data: PreviewData): Column<PreviewRow>[] {
  return data.columns.map((c, i) => ({
    key: `${i}-${c.name}`,
    header: c.name,
    align: c.type === 'number' ? ('right' as const) : ('left' as const),
    render: (row: PreviewRow) => formatCell(row.cells[i] ?? null, c.type),
  }));
}

function FileRow({ label, file, onFile }: { label: string; file: File | undefined; onFile: (f: File) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileName}>
        <b data-user-content>{label}</b>: {file ? <span data-user-content>{file.name}</span> : t('builder.preview.notChosen')}
      </span>
      {/* The native file input stays hidden behind the button (DESIGN: a hidden input[type=file] is allowed). */}
      <input
        ref={input}
        type="file"
        hidden
        accept=".xlsx,.xlsm,.csv"
        aria-label={t('builder.preview.fileLabel', { action: t('builder.preview.choose'), name: label })}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button compact aria-label={t('builder.preview.fileLabel', { action: file ? t('builder.preview.change') : t('builder.preview.choose'), name: label })} onClick={() => input.current?.click()}>
        {file ? t('builder.preview.change') : t('builder.preview.choose')}
      </Button>
    </div>
  );
}
