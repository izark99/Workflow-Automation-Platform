import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ParameterValue } from '../../engine/flow/parameters';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { Badge, Button, ButtonLink, Dropdown, ErrorState, ToastProvider, useToast } from '../components';
import { canRunFlow, todayIso } from '../screens/flows-logic';
import { useLoad, useStore } from '../store-context';
import { useT, errorText } from '../i18n';
import { CopyFlowDialog, DiscardDialog, NewVersionDialog, PublishDialog } from './builder-dialogs';
import { Canvas } from './canvas';
import type { Selection } from './canvas';
import { emptyDefinition } from './graph';
import { SettingsPanel } from './settings-panel';
import { StepList } from './step-list';
import { newVersionProblem, suggestStart } from '../screens/versions-logic';
import { canEditFlow, isDirty, publishBlockers, publishSummary, versionOptionLabel } from './version-logic';
import styles from './builder.module.css';


type Dialogs = 'publish' | 'newVersion' | 'copyFlow' | null;

/** The flow builder: header bar (64 px), step list (184 px), canvas and settings panel. No sidebar on this screen. */
export function BuilderScreen() {
  const { id = '' } = useParams();
  // Keyed on the flow: another flow (for example a copy) starts with fresh state, not with the data of the one before.
  return (
    <ToastProvider>
      <Builder key={id} />
    </ToastProvider>
  );
}

function Builder() {
  const t = useT();
  const { id = '', versionNo = '1' } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const flow = useLoad((s) => s.getFlow(id));
  const me = useLoad((s) => s.currentUser());
  const refs = useLoad((s) => s.listRefTables());
  const [testFiles, setTestFiles] = useState<Record<string, File>>({});
  // Test values of the parameters. They stay in the browser, like the test files, and are not saved with the flow.
  const [testValues, setTestValues] = useState<Record<string, ParameterValue | undefined>>({});
  const version = flow.data?.versions.find((v) => v.versionNo === Number(versionNo));
  const [definition, setDefinition] = useState<FlowDefinition>(emptyDefinition());
  const [selection, setSelection] = useState<Selection>({ nodes: [], edges: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [addRequest, setAddRequest] = useState<{ type: NodeType; n: number } | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'version' | 'copy' | null>(null);
  const [error, setError] = useState<{ what: string; next: string } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // The editable copy starts from the saved version when a flow or a version is opened, not after every save.
  const loadedKey = useRef('');
  useEffect(() => {
    if (!version) return;
    const key = `${id}:${version.versionNo}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setDefinition(structuredClone(version.definition) as FlowDefinition);
    setSelection({ nodes: [], edges: [] });
    setError(null);
  }, [id, version]);

  const editable = !!flow.data && canEditFlow(me.data, flow.data);
  const published = version?.status === 'published';
  const readOnly = !editable || published;
  const dirty = !!version && !readOnly && isDirty(definition, version.definition);

  // Closing the tab or reloading with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Leaves for another route; with unsaved changes it asks before discarding them. */
  const go = (to: string): void => {
    if (dirty) setPendingNav(to);
    else void navigate(to);
  };
  const guard = (to: string) => (e: MouseEvent<HTMLAnchorElement>): void => {
    if (!dirty) return;
    e.preventDefault();
    setPendingNav(to);
  };

  if (flow.error || (!flow.loading && !version)) {
    return (
      <main style={{ padding: '32px 40px' }}>
        <ErrorState what={t('builder.notFound')} next={t('builder.notFoundNext')} actions={<ButtonLink compact to="/flows">{t('builder.flowsLink')}</ButtonLink>} />
      </main>
    );
  }

  const save = async (): Promise<boolean> => {
    if (!version) return false;
    setBusy('save');
    setError(null);
    try {
      await store.saveFlowVersion(id, version.versionNo, { definition });
      flow.reload();
      return true;
    } catch (e) {
      setError({ what: t('builder.saveFailed'), next: errorText(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const publish = async (): Promise<void> => {
    if (!version || !flow.data) return;
    const blockers = publishBlockers(definition);
    if (blockers) {
      setDialogError(`${t('builder.cannotPublishNext')} ${blockers}`);
      return;
    }
    setBusy('publish');
    setDialogError(null);
    try {
      if (dirty) await store.saveFlowVersion(id, version.versionNo, { definition });
      const before = flow.data;
      const summary = publishSummary(before, version.versionNo);
      await store.publishFlowVersion(id, version.versionNo);
      flow.reload();
      setDialog(null);
      toast(`${t('builder.publishedToast', { n: version.versionNo })} ${summary.ok ? summary.text.split('. ')[0] + '.' : ''}`.trim());
    } catch (e) {
      setDialogError(errorText(e, t('builder.publishFailed')));
    } finally {
      setBusy(null);
    }
  };

  const createVersion = async (validFrom: string): Promise<void> => {
    if (!version) return;
    setBusy('version');
    setDialogError(null);
    try {
      const updated = await store.createFlowVersion(id, { validFrom, copyFrom: version.versionNo });
      const created = Math.max(...updated.versions.map((v) => v.versionNo));
      setDialog(null);
      navigate(`/flows/${id}/versions/${created}`);
      flow.reload();
    } catch (e) {
      setDialogError(errorText(e, t('builder.versionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const copyFlow = async (name: string): Promise<void> => {
    setBusy('copy');
    setDialogError(null);
    try {
      const copy = await store.copyFlow(id, name);
      setDialog(null);
      navigate(`/flows/${copy.id}/versions/1`);
    } catch (e) {
      setDialogError(errorText(e, t('builder.copyFailed')));
    } finally {
      setBusy(null);
    }
  };

  const versions = [...(flow.data?.versions ?? [])].sort((a, b) => b.versionNo - a.versionNo);
  const summary = flow.data && version ? publishSummary(flow.data, version.versionNo) : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link to="/flows" className={styles.crumb} onClick={guard('/flows')}>
          {t('builder.flowsLink')}
        </Link>
        <span className={styles.slash} aria-hidden="true">
          /
        </span>
        <h1 className={styles.title} data-user-content>{flow.data?.name ?? ''}</h1>
        {version ? (
          <Dropdown
            label={t('builder.version')}
            options={versions.map((v) => ({ value: String(v.versionNo), label: versionOptionLabel(v) }))}
            value={String(version.versionNo)}
            width={260}
            onChange={(no) => go(`/flows/${id}/versions/${no}`)}
          />
        ) : null}
        {version ? <Badge>{published ? t('builder.versionBadgePublished') : t('builder.versionBadgeDraft')}</Badge> : null}
        {dirty ? (
          <span className={styles.dirty} role="status">
            {t('builder.unsaved')}
          </span>
        ) : null}
        <div className={styles.barActions}>
          <ButtonLink to={`/flows/${id}/versions`} onClick={guard(`/flows/${id}/versions`)}>
            {t('builder.versions')}
          </ButtonLink>
          {editable && version && !published ? (
            <>
              <Button busy={busy === 'save'} disabled={!dirty} onClick={() => void save().then((ok) => ok && toast(t('builder.savedTitle', { n: version.versionNo })))}>
                {busy === 'save' ? t('builder.saving') : t('builder.saveDraft')}
              </Button>
              <Button variant="primary" onClick={() => { setDialogError(null); setDialog('publish'); }}>
                {t('builder.publish')}
              </Button>
            </>
          ) : null}
          {flow.data && canRunFlow(flow.data) ? (
            <ButtonLink variant="cta" to={`/flows/${id}/run`} onClick={guard(`/flows/${id}/run`)}>
              {t('builder.run')}
            </ButtonLink>
          ) : (
            <Button variant="cta" disabled>
              {t('builder.run')}
            </Button>
          )}
        </div>
      </header>
      {version && published && editable ? (
        <div className={styles.notice} role="status">
          <span>{t('builder.publishedNotice', { n: version.versionNo })}</span>
          <Button compact onClick={() => { setDialogError(null); setDialog('newVersion'); }}>
            {t('builder.newVersion')}
          </Button>
        </div>
      ) : null}
      {version && me.data && !editable && flow.data ? (
        <div className={styles.notice} role="status">
          <span>{t('builder.noEditNotice')}</span>
          <Button compact onClick={() => { setDialogError(null); setDialog('copyFlow'); }}>
            {t('builder.copyFlow')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div style={{ padding: '8px 24px' }}>
          <ErrorState what={error.what} next={error.next} />
        </div>
      ) : null}
      <main className={styles.body}>
        <StepList disabled={readOnly || !version} onAdd={(type) => setAddRequest((r) => ({ type, n: (r?.n ?? 0) + 1 }))} />
        <Canvas
          definition={definition}
          onChange={setDefinition}
          selection={selection}
          onSelect={setSelection}
          message={message}
          onMessage={setMessage}
          readOnly={readOnly}
          addRequest={addRequest}
        />
        <SettingsPanel
          definition={definition}
          step={selection.nodes.length === 1 ? definition.nodes.find((n) => n.id === selection.nodes[0]) : undefined}
          onChange={setDefinition}
          onDeleted={() => setSelection({ nodes: [], edges: [] })}
          readOnly={readOnly}
          testFiles={testFiles}
          onTestFile={(key, file) => setTestFiles((f) => ({ ...f, [key]: file }))}
          refTables={refs.data ?? []}
          parameterValues={testValues}
          onParameterValue={(key, value) => setTestValues((v) => ({ ...v, [key]: value }))}
        />
      </main>
      {dialog === 'publish' && version && summary ? (
        <PublishDialog
          versionNo={version.versionNo}
          text={summary.text}
          dirty={dirty}
          busy={busy === 'publish'}
          error={dialogError}
          onConfirm={() => void publish()}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'newVersion' && version && flow.data ? (
        <NewVersionDialog fromNo={version.versionNo} suggested={suggestStart(flow.data.versions, todayIso())} check={(d) => newVersionProblem(flow.data!.versions, d)} busy={busy === 'version'} error={dialogError} onCreate={(d) => void createVersion(d)} onCancel={() => setDialog(null)} />
      ) : null}
      {dialog === 'copyFlow' && flow.data ? (
        <CopyFlowDialog suggested={`${flow.data.name} (copy)`} busy={busy === 'copy'} error={dialogError} onCreate={(n) => void copyFlow(n)} onCancel={() => setDialog(null)} />
      ) : null}
      {pendingNav ? (
        <DiscardDialog
          onStay={() => setPendingNav(null)}
          onDiscard={() => {
            const to = pendingNav;
            setPendingNav(null);
            navigate(to);
          }}
        />
      ) : null}
    </div>
  );
}
