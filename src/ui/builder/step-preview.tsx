import { useEffect, useRef, useState } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import type { ParameterValue } from '../../engine/flow/parameters';
import { parametersUsedBy } from '../../engine/flow/parameters-used';
import type { FileSource } from '../../engine/input/load';
import { checkFileSize } from '../../engine/size-guard';
import { EngineError } from '../../engine/types';
import type { RefTable } from '../../engine/versions';
import { Button, Chip, Icon, ChipGroup, DatePicker, EmptyState, ErrorState, InfoTip, QuietWarning, SkeletonTable, PreviewTable } from '../components';
import { bindableSetting } from '../../engine/flow/bindable';
import { parametersOf } from '../../engine/flow/parameters';
import { AnalysisPanel } from './analyze/analysis-panel';
import { ParameterControl } from './parameter-control/parameter-control';
import { stepBindingResults } from './parameter-control/parameter-control-logic';
import { settingLabel } from './parameter-control/setting-labels';
import { useT, errorText } from '../i18n';
import { ParameterInputs, PendingParametersNote } from '../parameter-inputs';
import { initialValues, parameterValueErrors } from '../parameter-logic';
import { capRows, neededFiles, outputChipText, previewKey, previewTableData, previewTarget } from './preview-logic';
import { PreviewDialog } from './preview-dialog';
import type { PopupState } from './preview-dialog';
import { MAX_PREVIEW_ROWS, runPreview } from './preview-runner';
import type { PreviewData, PreviewPart } from './preview-runner';
import styles from './step-preview.module.css';

export interface StepPreviewProps {
  /** The test date (ISO), kept by the builder so the forms can show what it selects. */
  date: string;
  onDate: (date: string) => void;
  /** For an Input step: saves the settings that "Analyze file" proposed and shows the Configure tab. */
  onApplySettings?: (settings: Record<string, unknown>) => void;
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
export function StepPreview({ definition, step, files, onFile, refTables, parameterValues, onParameterValue, date, onDate, onApplySettings }: StepPreviewProps) {
  const t = useT();
  const [handle, setHandle] = useState<string | undefined>(undefined);
  const [state, setState] = useState<State>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);
  // The popup (SPEC 15.3): it shows the same state, and runs the preview again for the other part or for more rows.
  const [popup, setPopup] = useState(false);
  const popupLimit = useRef(100);
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
  // What each setting of this step that uses a parameter gets from the test values: the value, or the reason it cannot be used.
  const bound = stepBindingResults(step, parametersOf(definition), values);
  const key = previewKey(target.definition, target.nodeId, target.handle, date) + JSON.stringify(values);

  const run = async (part: PreviewPart = 'first', limit?: number): Promise<void> => {
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
      const data = await runPreview({ definition: target.definition, nodeId: target.nodeId, handle: target.handle, files: sources, refTables, effectiveDate: date, parameterValues: values, part, ...(limit ? { limit } : {}), signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'ready', data, key });
    } catch (e) {
      if (!controller.signal.aborted) setState({ status: 'error', message: errorText(e) });
    }
  };

  // The Test tab always shows 100 rows, also after the popup loaded more.
  const shown = state.status === 'ready' ? capRows(state.data, 100) : null;
  const { columns, rows } = shown ? previewTableData(shown) : { columns: [], rows: [] };
  const popupState: PopupState = state.status === 'ready' ? { status: 'ready', data: state.data, stale: state.key !== key } : state.status === 'error' ? { status: 'error', message: state.message } : state.status === 'loading' ? { status: 'loading' } : { status: 'idle' };

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
      {bound.length > 0 ? (
        <div className={styles.block} role="group" aria-label={t('builder.preview.boundTitle')}>
          <span className={styles.label}>{t('builder.preview.boundTitle')}</span>
          {bound.map((b) => (
            <ParameterControl
              key={b.setting}
              field={settingLabel(step.type, b.setting)}
              setting={bindableSetting(step.type, b.setting)!}
              parameters={parametersOf(definition)}
              value={step.settings[b.setting]}
              readOnly
              viewOnly
              onBind={() => undefined}
              onUnbind={() => undefined}
              now={b.outcome.ok && b.param ? { type: b.param.type, value: b.outcome.value } : undefined}
              error={b.outcome.ok ? undefined : b.outcome.error}
            >
              {null}
            </ParameterControl>
          ))}
        </div>
      ) : null}
      {step.type === 'input_file' && onApplySettings ? (
        <AnalysisPanel key={(() => { const f = typeof step.settings.key === 'string' ? files[step.settings.key] : undefined; return f ? `${f.name}:${f.size}:${f.lastModified}` : 'none'; })()} file={typeof step.settings.key === 'string' ? files[step.settings.key] : undefined} settings={step.settings} onApply={onApplySettings} />
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
                {outputChipText(h, state.status === 'ready' ? state.data.counts[h] : undefined)}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button busy={state.status === 'loading'} disabled={missing.length > 0 || invalid} onClick={() => void run('first')}>
          {state.status === 'loading' ? t('builder.preview.busy') : t('builder.preview.button')}
        </Button>
        <Button disabled={state.status === 'loading' || missing.length > 0 || invalid} onClick={() => void run('last')}>
          {t('builder.preview.buttonLast')}
        </Button>
      </div>
      {missing.length > 0 && state.status === 'idle' ? <EmptyState title={t('builder.preview.empty')} text={t('builder.preview.emptyText')} action={null} /> : null}
      {state.status === 'loading' ? <SkeletonTable weights={[1, 1, 1]} rows={3} label={t('builder.preview.loading')} /> : null}
      {state.status === 'error' ? <ErrorState what={t('builder.preview.failed')} next={state.message} /> : null}
      {state.status === 'ready' ? (
        <div className={styles.block}>
          {state.key !== key ? <p className={styles.muted} role="status">{t('builder.preview.stale')}</p> : null}
          <QuietWarning lines={state.data.warnings} />
          <div className={styles.countRow}>
          <span className={styles.muted}>{shown!.totalRows === 0 ? t('builder.preview.noRows') : (shown!.totalRows > shown!.rows.length ? (shown!.part === 'last' ? t('builder.preview.showingLast', { shown: shown!.rows.length.toLocaleString('en-US'), total: shown!.totalRows.toLocaleString('en-US'), from: shown!.fromRow.toLocaleString('en-US') }) : t('builder.preview.showing', { shown: shown!.rows.length.toLocaleString('en-US'), total: shown!.totalRows.toLocaleString('en-US') })) : t('builder.preview.rowCount', { total: shown!.totalRows, totalText: shown!.totalRows.toLocaleString('en-US') }))}</span>
            <Button size="sm" icon aria-label={t('builder.preview.expand')} onClick={() => { popupLimit.current = 100; setPopup(true); }}>
              <Icon name="maximize" />
            </Button>
          </div>
          {state.data.rows.length > 0 ? (
            <div className={styles.result}>
              <PreviewTable label={t('builder.preview.table')} columns={columns} rows={rows} />
            </div>
          ) : null}
        </div>
      ) : null}
      {popup ? (
        <PreviewDialog
          stepName={step.label ?? step.id}
          state={popupState}
          onClose={() => setPopup(false)}
          onPart={(p) => void run(p, popupLimit.current)}
          onShowMore={() => {
            popupLimit.current = MAX_PREVIEW_ROWS;
            void run(state.status === 'ready' ? state.data.part : 'first', MAX_PREVIEW_ROWS);
          }}
        />
      ) : null}
    </div>
  );
}

const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

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
      <Button size="sm" aria-label={t('builder.preview.fileLabel', { action: file ? t('builder.preview.change') : t('builder.preview.choose'), name: label })} onClick={() => input.current?.click()}>
        {file ? t('builder.preview.change') : t('builder.preview.choose')}
      </Button>
    </div>
  );
}
