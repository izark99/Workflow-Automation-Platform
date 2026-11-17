import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, CrumbLink, DatePicker, ErrorState, ScreenFrame, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { CopyVersionHost } from './versions-dialogs';
import { formatDate } from '../../engine/versions';
import type { FlowDefinition } from '../../engine/flow/types';
import type { FlowRecord, FlowVersionRecord } from '../../store/types';
import { PublishDialog } from '../builder/builder-dialogs';
import { canEditFlow, publishBlockers, publishSummary } from '../builder/version-logic';
import { useLoad, useStore } from '../store-context';
import { strings, versionsStrings as t } from '../strings';
import { todayIso } from './flows-logic';
import { dateCheck, rangeEnd, stateText, timeline, timelineNote, versionState } from './versions-logic';
import styles from './versions.module.css';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');

/** The versions of one flow: timeline, table, new version from a copy, publish, and a check of which version a date uses. */
export function VersionsScreen() {
  const { id = '' } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const data = useLoad(async (s) => ({ flow: await s.getFlow(id), me: await s.currentUser() }));
  const showSkeleton = useDelayedLoading(data.loading);
  const [checkDate, setCheckDate] = useState(todayIso());
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [publishNo, setPublishNo] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flow = data.data?.flow;
  const editable = !!flow && canEditFlow(data.data?.me, flow);
  const today = todayIso();

  const publish = async (record: FlowRecord, no: number): Promise<void> => {
    const version = record.versions.find((v) => v.versionNo === no);
    if (!version) return;
    const blockers = publishBlockers(version.definition as FlowDefinition);
    if (blockers) {
      setPublishError(`${t.cannotPublish} ${blockers}`);
      return;
    }
    setBusy(true);
    setPublishError(null);
    try {
      await store.publishFlowVersion(record.id, no);
      setPublishNo(null);
      toast(t.published(no));
      data.reload();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : t.publishFailed);
    } finally {
      setBusy(false);
    }
  };

  const crumb = (
    <>
      <CrumbLink to="/flows">{strings.screens.versions.crumb}</CrumbLink>
      <span aria-hidden="true">/</span>
      {flow ? <CrumbLink to={`/flows/${flow.id}/versions/${[...flow.versions].sort((a, b) => b.versionNo - a.versionNo)[0]?.versionNo ?? 1}`}>{flow.name}</CrumbLink> : null}
    </>
  );

  let body;
  if (data.error) {
    body = <ErrorState what={t.loadFailed} next={t.loadFailedNext} actions={<ButtonLink compact to="/flows">{strings.screens.versions.crumb}</ButtonLink>} />;
  } else if (!flow) {
    body = data.loading && showSkeleton ? <SkeletonTable weights={[8, 16, 12, 12, 30, 18]} rows={3} label="Loading the versions" /> : null;
  } else {
    const sorted = [...flow.versions].sort((a, b) => b.versionNo - a.versionNo);
    const segments = timeline(flow.versions, today);
    const note = timelineNote(flow.versions, flow.name);
    const check = dateCheck(flow.versions, checkDate);
    const columns: Column<FlowVersionRecord>[] = [
      { key: 'version', header: t.cols.version, render: (v) => <b>v{v.versionNo}</b> },
      {
        key: 'status',
        header: t.cols.status,
        render: (v) => {
          const s = versionState(v, today);
          return <Badge tone={s === 'in_effect' ? 'soft' : 'outline'}>{stateText(s)}</Badge>;
        },
      },
      { key: 'from', header: t.cols.from, render: (v) => two(v.validFrom) },
      { key: 'to', header: t.cols.to, render: (v) => rangeEnd(v) },
      { key: 'note', header: t.cols.note, render: (v) => v.changeNote },
      {
        key: 'actions',
        header: t.cols.actions,
        render: (v) => (
          <div className={styles.actions}>
            <ButtonLink compact to={`/flows/${flow.id}/versions/${v.versionNo}`} aria-label={`${v.status === 'draft' && editable ? t.edit : t.view} v${v.versionNo}`}>
              {v.status === 'draft' && editable ? t.edit : t.view}
            </ButtonLink>
            {editable && v.status === 'draft' ? (
              <Button compact variant="primary" aria-label={`${t.publish} v${v.versionNo}`} onClick={() => { setPublishError(null); setPublishNo(v.versionNo); }}>
                {t.publish}
              </Button>
            ) : null}
            {editable ? (
              <Button compact aria-label={`${t.copy} v${v.versionNo}`} onClick={() => setCopyFrom(v.versionNo)}>
                {t.copy}
              </Button>
            ) : null}
          </div>
        ),
      },
    ];
    body = (
      <>
        <section aria-label={t.timeline} className="timeline-card" style={{ background: 'var(--color-card)', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-card)', padding: 20, minWidth: 0 }}>
          <ol className={`${styles.bar} ${styles.list}`} aria-label={t.timeline}>
            {segments.map((s) => (
              <li key={s.versionNo} className={`${styles.segment} ${s.state === 'in_effect' ? styles.inEffect : ''} ${s.state === 'draft' ? styles.draft : ''}`} style={{ flex: `${s.weight} 1 0` }}>
                <b>{s.title}</b>
                <span className={styles.sub}>{s.sub}</span>
              </li>
            ))}
          </ol>
          <div className={styles.axis} aria-hidden="true">
            {segments.map((s) => (
              <span key={s.versionNo} style={{ flex: `${s.weight} 1 0` }}>
                {s.axis}
              </span>
            ))}
          </div>
          <p className={styles.note} role={note.problem ? 'alert' : 'note'}>
            {note.text}
          </p>
        </section>
        <Card flush title={t.table}>
          <Table label={t.table} columns={columns} rows={sorted} rowKey={(v) => String(v.versionNo)} />
        </Card>
        <Card title={t.checkerTitle}>
          <div className={styles.checker}>
            <DatePicker label={t.checkerDate} value={checkDate} onChange={setCheckDate} />
            <span role="status">{check.text}</span>
          </div>
        </Card>
        {copyFrom !== null ? <CopyVersionHost flow={flow} fromNo={copyFrom} today={today} onClose={() => setCopyFrom(null)} onCreated={(no) => { setCopyFrom(null); toast(t.created(no)); navigate(`/flows/${flow.id}/versions/${no}`); }} /> : null}
        {publishNo !== null ? (
          <PublishDialog
            versionNo={publishNo}
            text={publishSummary(flow, publishNo).text}
            dirty={false}
            busy={busy}
            error={publishError}
            onConfirm={() => void publish(flow, publishNo)}
            onCancel={() => setPublishNo(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <ScreenFrame
      breadcrumb={crumb}
      title={strings.screens.versions.title}
      subtitle={strings.screens.versions.subtitle}
      action={flow && editable ? <Button variant="primary" onClick={() => setCopyFrom([...flow.versions].sort((a, b) => b.versionNo - a.versionNo)[0]?.versionNo ?? 1)}>{t.newVersion}</Button> : undefined}
    >
      {body}
    </ScreenFrame>
  );
}
