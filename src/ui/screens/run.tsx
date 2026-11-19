import type { ParameterValue } from '../../engine/flow/parameters';
import { parametersOf } from '../../engine/flow/parameters';
import { ParameterInputs, PendingParametersNote } from '../parameter-inputs';
import { initialValues, parameterValueErrors } from '../parameter-logic';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EngineError } from '../../engine/types';
import type { Cell } from '../../engine/types';
import { checkFileSize } from '../../engine/size-guard';
import { prepareRun } from '../../engine/versions';
import type { FlowDefinition } from '../../engine/flow/types';
import { Badge, Button, ButtonLink, Card, CrumbLink, DatePicker, EmptyState, ErrorState, ProgressBar, ScreenFrame, SkeletonTable, Table, Tabs, useDelayedLoading } from '../components';
import type { Column } from '../components';
import { formatCell } from '../builder/preview-logic';
import { useLoad, useStore } from '../store-context';
import { useT, errorText } from '../i18n';
import { todayIso } from './flows-logic';
import { executeRun } from './run-engine';
import type { RunOutcome } from './run-engine';
import { inputsOf, progressText, sheetLabel, sizeLabel, versionRows } from './run-logic';
import styles from './run.module.css';

type RunState = { status: 'idle' } | { status: 'running'; started: number; total: number; label: string } | { status: 'done'; outcome: RunOutcome } | { status: 'cancelled' } | { status: 'error'; message: string };

const omit = <T,>(obj: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

function download(name: string, mime: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Run a flow: effective date, the versions that date uses, the input files, the run, and the result with a download. */
export function RunScreen() {
  const t = useT();
  const { id = '' } = useParams();
  const store = useStore();
  const flow = useLoad(async (s) => ({ flow: await s.getFlow(id), refs: await s.listRefTables() }));
  const showSkeleton = useDelayedLoading(flow.loading);
  const [date, setDate] = useState(todayIso());
  const [files, setFiles] = useState<Record<string, File>>({});
  // What the user typed in the Parameters card. Not remembered between runs: the form starts from the defaults.
  const [typed, setTyped] = useState<Record<string, ParameterValue | undefined>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const [sheetTab, setSheetTab] = useState('0');
  const abort = useRef<AbortController | null>(null);

  const record = flow.data?.flow;
  const refs = useMemo(() => flow.data?.refs ?? [], [flow.data]);
  const prepared = useMemo(() => {
    if (!record) return undefined;
    try {
      return { ok: true as const, run: prepareRun({ flowName: record.name, flowVersions: record.versions, refTables: refs, effectiveDate: date }) };
    } catch (e) {
      return { ok: false as const, message: errorText(e), noPublished: !record.versions.some((v) => v.status === 'published') };
    }
  }, [record, refs, date]);

  const definition = prepared?.ok ? (prepared.run.definition as FlowDefinition) : undefined;
  const inputs = definition ? inputsOf(definition) : [];
  const parameters = definition ? parametersOf(definition) : [];
  const values = initialValues(parameters, typed);
  const valueErrors = parameterValueErrors(parameters, values);
  const hasParameters = parameters.length > 0;
  const missing = inputs.filter((i) => !files[i.key]);
  const running = state.status === 'running';

  const choose = (key: string, file: File): void => {
    const guard = checkFileSize(file);
    if (!guard.ok) {
      // Too large to read safely: refuse it here, and start nothing.
      setFileErrors((e) => ({ ...e, [key]: t('engine.fileTooLarge', { fileName: file.name, size: sizeLabel(guard.sizeBytes), limit: sizeLabel(guard.limitBytes) }) }));
      setFiles((f) => omit(f, key));
      return;
    }
    setFileErrors((e) => omit(e, key));
    setFiles((f) => ({ ...f, [key]: file }));
    setState({ status: 'idle' });
  };

  const run = async (): Promise<void> => {
    if (!prepared?.ok || !definition || !record) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'running', started: 0, total: definition.nodes.length, label: '' });
    let outcome: RunOutcome | undefined;
    let failure: string | undefined;
    let cancelled = false;
    try {
      outcome = await executeRun({
        definition,
        effectiveDate: date,
        parameterValues: values,
        files,
        refTables: prepared.run.refTables,
        signal: controller.signal,
        onProgress: (started, total, label) => setState({ status: 'running', started, total, label }),
      });
    } catch (e) {
      if (e instanceof EngineError && e.code === 'cancelled') cancelled = true;
      else failure = errorText(e);
    }
    try {
      // The run log holds counts only: no names and no cell values.
      await store.addRunLog({ flowId: record.id, versionNo: prepared.run.resolved.flow, effectiveDate: date, inputRows: outcome?.inputRows ?? 0, outputRows: outcome?.outputRows ?? 0, status: outcome ? 'ok' : 'failed' });
    } catch {
      // A failed log entry must not hide the result of the run.
    }
    if (outcome) {
      setSheetTab('0');
      setState({ status: 'done', outcome });
    } else setState(cancelled ? { status: 'cancelled' } : { status: 'error', message: failure ?? '' });
  };

  const crumb = (
    <>
      <CrumbLink to="/flows">{t('run.crumbFlows')}</CrumbLink>
      <span aria-hidden="true">/</span>
      {record ? <CrumbLink to={`/flows/${record.id}/versions/${record.versions[0]?.versionNo ?? 1}`}><span data-user-content>{record.name}</span></CrumbLink> : null}
    </>
  );

  let body;
  if (flow.error) {
    body = <ErrorState what={t('run.loadFailed')} next={t('run.loadFailedNext')} actions={<ButtonLink compact to="/flows">{t('run.crumbFlows')}</ButtonLink>} />;
  } else if (flow.loading || !record) {
    body = showSkeleton ? <SkeletonTable weights={[30, 16, 8]} rows={3} label={t('run.loading')} /> : null;
  } else {
    const rows = prepared?.ok ? versionRows(prepared.run, record.name, record.versions, refs) : [];
    body = (
      <>
        <Card title={t('run.step1')}>
          <DatePicker label={t('run.date')} value={date} onChange={(d) => { setDate(d); setState({ status: 'idle' }); }} disabled={running} />
          <div role="group" aria-label={t('run.versionsTitle')} className={styles.list}>
            <span className={styles.name}>{t('run.versionsTitle')}</span>
            {prepared?.ok
              ? rows.map((r) => (
                  <div key={r.name} className={styles.row}>
                    <span>{r.name}</span>
                    <span className={styles.sub}>{r.range}</span>
                  </div>
                ))
              : null}
          </div>
          {prepared && !prepared.ok ? (
            <ErrorState
              what={prepared.noPublished ? t('run.noPublished') : t('run.versionsFailed')}
              next={prepared.noPublished ? t('run.noPublishedNext') : prepared.message}
              actions={prepared.noPublished ? <ButtonLink compact to={`/flows/${record.id}/versions/${record.versions[0]?.versionNo ?? 1}`}>{t('run.openBuilder')}</ButtonLink> : undefined}
            />
          ) : null}
        </Card>

        {hasParameters ? (
          <Card title={t('run.stepParams')}>
            <ParameterInputs
              parameters={parameters}
              values={values}
              errors={valueErrors}
              disabled={running}
              onChange={(key, value) => {
                setTyped((v) => ({ ...v, [key]: value }));
                setState({ status: 'idle' });
              }}
            />
          </Card>
        ) : null}

        <Card title={hasParameters ? t('run.step2WithParams') : t('run.step2')}>
          {prepared?.ok && inputs.length === 0 ? <p className={styles.note}>{t('run.noInputs')}</p> : null}
          <div role="group" aria-label={t('run.files')} className={styles.list}>
            {inputs.map((i) => (
              <FileRow key={i.key} label={i.label} name={i.key} file={files[i.key]} error={fileErrors[i.key]} disabled={running} onFile={(f) => choose(i.key, f)} />
            ))}
          </div>
          <PendingParametersNote parameters={parameters} errors={valueErrors} action="run" />
          <div className={styles.actions}>
            <Button variant="primary" busy={running} disabled={!prepared?.ok || missing.length > 0 || Object.keys(valueErrors).length > 0} onClick={() => void run()}>
              {running ? t('run.running') : state.status === 'idle' ? t('run.run') : t('run.runAgain')}
            </Button>
            {running ? (
              <Button onClick={() => abort.current?.abort()}>{t('run.cancel')}</Button>
            ) : null}
          </div>
          {state.status === 'running' ? (
            <div className={styles.progress}>
              <ProgressBar value={state.started} max={state.total} label={t('run.progress')} />
              <span>{state.started > 0 ? progressText(state.started, state.total, state.label) : t('run.running')}</span>
            </div>
          ) : null}
          {state.status === 'cancelled' ? <p className={styles.note} role="status">{t('run.cancelled')}</p> : null}
        </Card>

        {state.status === 'done' || state.status === 'error' ? (
          <Card title={state.status === 'done' ? t('run.finished') : hasParameters ? t('run.step3WithParams') : t('run.step3')}>
            {state.status === 'error' ? <ErrorState what={t('run.failed')} next={state.message || t('run.failedNext')} /> : <Result outcome={state.outcome} tab={sheetTab} onTab={setSheetTab} />}
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <ScreenFrame breadcrumb={crumb} title={t('run.title')} subtitle={t('run.subtitle')}>
      {body}
    </ScreenFrame>
  );
}

function FileRow({ label, name, file, error, disabled, onFile }: { label: string; name: string; file: File | undefined; error: string | undefined; disabled: boolean; onFile: (f: File) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className={styles.row}>
        <span className={styles.rowText}>
          <span className={styles.name} data-user-content>{label}</span>
          <span className={styles.sub}>{file ? t('run.fileInfo', { name: file.name, size: sizeLabel(file.size) }) : t('run.noFile')}</span>
        </span>
        <span className={styles.rowActions}>
          {file ? <Badge>{t('run.ready')}</Badge> : null}
          {/* The native file input stays hidden behind the button (DESIGN allows a hidden input[type=file]). */}
          <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.csv" aria-label={t('run.fileLabel', { action: t('run.chooseFile'), name })} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          <Button compact disabled={disabled} aria-label={t('run.fileLabel', { action: file ? t('run.changeFile') : t('run.chooseFile'), name: label })} onClick={() => input.current?.click()}>
            {file ? t('run.changeFile') : t('run.chooseFile')}
          </Button>
        </span>
      </div>
      {error ? <ErrorState what={error.split('. ')[0] + '.'} next={error.split('. ').slice(1).join('. ')} /> : null}
    </div>
  );
}

function Result({ outcome, tab, onTab }: { outcome: RunOutcome; tab: string; onTab: (t: string) => void }) {
  const t = useT();
  const sheet = outcome.sheets[Number(tab)] ?? outcome.sheets[0];
  const columns: Column<{ i: number; cells: Cell[] }>[] = sheet
    ? sheet.table.columns.map((c, ci) => ({ key: `${ci}-${c.name}`, header: c.name, align: c.type === 'number' ? ('right' as const) : ('left' as const), render: (row) => formatCell(row.cells[ci] ?? null, c.type) }))
    : [];
  return (
    <>
      <div className={styles.split}>
        <div className={styles.downloads}>
          {outcome.files.map((f) => (
            <Button key={f.name} variant="primary" onClick={() => download(f.name, f.mimeType, f.bytes)}>
              {t('run.download', { name: f.name })}
            </Button>
          ))}
        </div>
      </div>
      {sheet ? (
        <Tabs label={t('run.sheetsLabel')} tabs={outcome.sheets.map((s, i) => ({ id: String(i), label: sheetLabel(s.sheet, s.rowCount) }))} selected={tab} onSelect={onTab}>
          <p className={styles.note} style={{ paddingTop: 12 }}>
            {sheet.rowCount === 0 ? t('run.emptySheet') : t('run.preview', { sheet: sheet.sheet, shownText: sheet.table.rows.length.toLocaleString('en-US'), total: sheet.rowCount, totalText: sheet.rowCount.toLocaleString('en-US') })}
          </p>
          {sheet.table.rows.length > 0 ? (
            <div className={styles.result} data-user-content>
              <Table label={t('run.previewTable', { sheet: sheet.sheet })} columns={columns} rows={sheet.table.rows.map((cells, i) => ({ i, cells }))} rowKey={(r) => String(r.i)} />
            </div>
          ) : null}
        </Tabs>
      ) : (
        <EmptyState title={t('run.noOutputTitle')} text={t('run.noOutputText')} action={null} />
      )}
    </>
  );
}
