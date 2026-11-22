import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, CrumbLink, DatePicker, ErrorState, ScreenFrame, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { CopyVersionHost } from './versions-dialogs';
import type { FlowDefinition } from '../../engine/flow/types';
import type { FlowRecord, FlowVersionRecord } from '../../store/types';
import { PublishDialog } from '../builder/builder-dialogs';
import { canEditFlow, publishBlockers, publishSummary } from '../builder/version-logic';
import { useLoad, useStore } from '../store-context';
import { useT, errorText, formatDate } from '../i18n';
import { todayIso } from './flows-logic';
import { STATE_BADGE, dateCheck, rangeEnd, stateText, timeline, timelineNote, versionState } from './versions-logic';
import styles from './versions.module.css';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');

/** The versions of one flow: timeline, table, new version from a copy, publish, and a check of which version a date uses. */
export function VersionsScreen() {
  const t = useT();
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
      setPublishError(t('common.pair', { a: t('versions.cannotPublish'), b: blockers }));
      return;
    }
    setBusy(true);
    setPublishError(null);
    try {
      await store.publishFlowVersion(record.id, no);
      setPublishNo(null);
      toast(t('versions.published', { n: no }));
      data.reload();
    } catch (e) {
      setPublishError(errorText(e, t('versions.publishFailed')));
    } finally {
      setBusy(false);
    }
  };

  const crumb = (
    <>
      <CrumbLink to="/flows">{t('versions.screen.crumb')}</CrumbLink>
      <span aria-hidden="true">/</span>
      {flow ? <CrumbLink to={`/flows/${flow.id}/versions/${[...flow.versions].sort((a, b) => b.versionNo - a.versionNo)[0]?.versionNo ?? 1}`}><span data-user-content>{flow.name}</span></CrumbLink> : null}
    </>
  );

  let body;
  if (data.error) {
    body = <ErrorState what={t('versions.loadFailed')} next={t('versions.loadFailedNext')} actions={<ButtonLink size="sm" to="/flows">{t('versions.screen.crumb')}</ButtonLink>} />;
  } else if (!flow) {
    body = data.loading && showSkeleton ? <SkeletonTable weights={[8, 16, 12, 12, 30, 18]} rows={3} label={t('versions.loading')} /> : null;
  } else {
    const sorted = [...flow.versions].sort((a, b) => b.versionNo - a.versionNo);
    const segments = timeline(flow.versions, today);
    const note = timelineNote(flow.versions, flow.name);
    const check = dateCheck(flow.versions, checkDate);
    const columns: Column<FlowVersionRecord>[] = [
      { key: 'version', header: t('versions.cols.version'), render: (v) => <b>{t('common.versionLabel', { n: v.versionNo })}</b> },
      {
        key: 'status',
        header: t('versions.cols.status'),
        render: (v) => {
          const s = versionState(v, today);
          return <Badge tone={STATE_BADGE[s].tone} icon={STATE_BADGE[s].icon}>{stateText(s)}</Badge>;
        },
      },
      { key: 'from', header: t('versions.cols.from'), render: (v) => two(v.validFrom) },
      { key: 'to', header: t('versions.cols.to'), render: (v) => rangeEnd(v) },
      { key: 'note', header: t('versions.cols.note'), ellipsis: true, render: (v) => <span data-user-content title={v.changeNote}>{v.changeNote}</span> },
      {
        key: 'actions',
        header: t('versions.cols.actions'),
        wrap: true,
        render: (v) => (
          <div className={styles.actions}>
            <ButtonLink size="sm" to={`/flows/${flow.id}/versions/${v.versionNo}`} aria-label={t('versions.actionLabel', { action: v.status === 'draft' && editable ? t('versions.edit') : t('versions.view'), n: v.versionNo })}>
              {v.status === 'draft' && editable ? t('versions.edit') : t('versions.view')}
            </ButtonLink>
            {editable && v.status === 'draft' ? (
              <Button size="sm" aria-label={t('versions.actionLabel', { action: t('versions.publish'), n: v.versionNo })} onClick={() => { setPublishError(null); setPublishNo(v.versionNo); }}>
                {t('versions.publish')}
              </Button>
            ) : null}
            {editable ? (
              <Button size="sm" aria-label={t('versions.actionLabel', { action: t('versions.copy'), n: v.versionNo })} onClick={() => setCopyFrom(v.versionNo)}>
                {t('versions.copy')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ];
    body = (
      <>
        <section aria-label={t('versions.timeline')} className={styles.timelineCard}>
          <ol className={`${styles.bar} ${styles.list}`} aria-label={t('versions.timeline')}>
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
        <Card flush title={t('versions.table')}>
          <Table label={t('versions.table')} columns={columns} rows={sorted} rowKey={(v) => String(v.versionNo)} />
        </Card>
        <Card title={t('versions.checkerTitle')}>
          <div className={styles.checker}>
            <DatePicker label={t('versions.checkerDate')} value={checkDate} onChange={setCheckDate} />
            <span role="status">{check.text}</span>
          </div>
        </Card>
        {copyFrom !== null ? <CopyVersionHost flow={flow} fromNo={copyFrom} today={today} onClose={() => setCopyFrom(null)} onCreated={(no) => { setCopyFrom(null); toast(t('versions.created', { n: no })); navigate(`/flows/${flow.id}/versions/${no}`); }} /> : null}
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
      title={t('versions.screen.title')}
      subtitle={t('versions.screen.subtitle')}
      action={flow && editable ? <Button onClick={() => setCopyFrom([...flow.versions].sort((a, b) => b.versionNo - a.versionNo)[0]?.versionNo ?? 1)}>{t('versions.newVersion')}</Button> : undefined}
    >
      {body}
    </ScreenFrame>
  );
}
