import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, Chip, ChipGroup, Dialog, EmptyState, ErrorState, ScreenFrame, SearchField, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import type { ShellContext } from '../shell';
import { useLoad, useStore } from '../store-context';
import { translateMessage, useT, errorText } from '../i18n';
import type { FlowRecord } from '../../store/types';
import { canDeleteFlow, canRunFlow, describeRange, describeSteps, filterFlows, todayIso, versionInEffect, versionToOpen } from './flows-logic';
import type { ScopeFilter } from './flows-logic';
import styles from './flows.module.css';

export function FlowsScreen() {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const { openCreateFlow } = useOutletContext<ShellContext>();
  const data = useLoad(async (s) => ({ flows: await s.listFlows(), me: await s.currentUser() }));
  const showSkeleton = useDelayedLoading(data.loading);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<FlowRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const today = todayIso();

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return;
    try {
      await store.deleteFlow(toDelete.id);
      toast(t('flows.deleted', { name: toDelete.name }));
      setToDelete(null);
      data.reload();
    } catch (e) {
      setDeleteError(errorText(e, t('flows.deleteFailed')));
    }
  };

  const flows = data.data?.flows ?? [];
  const me = data.data?.me;
  const shown = filterFlows(flows, scope, search);

  const columns: Column<FlowRecord>[] = [
    {
      key: 'flow',
      header: t('flows.cols.flow'),
      render: (f) => (
        <>
          <b data-user-content>{f.name}</b>
          <br />
          <span className={styles.sub}>{translateMessage(describeSteps((versionToOpen(f, today) ?? f.versions[0])?.definition))}</span>
        </>
      ),
    },
    {
      key: 'scope',
      header: t('flows.cols.scope'),
      render: (f) => (
        <>
          <Badge tone={f.scope === 'shared' ? 'outline' : 'soft'}>{f.scope === 'shared' ? t('flows.shared') : t('flows.personal')}</Badge>
          <br />
          <span className={styles.sub}>{f.scope === 'shared' ? <span data-user-content>{(f.groupNames ?? []).join(', ') || '-'}</span> : t('flows.onlyOwner')}</span>
        </>
      ),
    },
    { key: 'owner', header: t('flows.cols.owner'), render: (f) => <span data-user-content>{f.ownerName ?? ''}</span> },
    {
      key: 'version',
      header: t('flows.cols.version'),
      render: (f) => {
        const v = versionInEffect(f, today) ?? versionToOpen(f, today);
        return v ? (
          <>
            {t('common.versionLabel', { n: v.versionNo })} <Badge tone={v.status === 'published' ? 'success' : 'accent'} icon={v.status === 'published' ? 'circle-check' : 'pencil'}>{v.status === 'published' ? t('flows.published') : t('flows.draft')}</Badge>
          </>
        ) : null;
      },
    },
    { key: 'range', header: t('flows.cols.range'), render: (f) => translateMessage(describeRange(versionInEffect(f, today))) },
    {
      key: 'actions',
      header: t('flows.cols.actions'),
      render: (f) => {
        const open = versionToOpen(f, today);
        return (
          <div className={styles.actions}>
            <ButtonLink size="sm" to={`/flows/${f.id}/versions/${open?.versionNo ?? 1}`} aria-label={t('flows.openFlow', { name: f.name })}>
              {t('flows.open')}
            </ButtonLink>
            {canRunFlow(f) ? (
              <ButtonLink size="sm" to={`/flows/${f.id}/run`} aria-label={t('flows.runFlow', { name: f.name })}>
                {t('flows.run')}
              </ButtonLink>
            ) : null}
            {me && canDeleteFlow(me, f) ? (
              <Button size="sm" variant="danger" aria-label={t('flows.deleteFlow', { name: f.name })} onClick={() => { setDeleteError(null); setToDelete(f); }}>
                {t('flows.delete')}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  let body;
  if (data.error) {
    body = <ErrorState what={t('errors.loadFailed')} next={t('errors.loadFailedNext')} actions={<Button size="sm" onClick={data.reload}>{t('flows.retry')}</Button>} />;
  } else if (data.loading) {
    body = showSkeleton ? <SkeletonTable weights={[30, 16, 8, 14, 14, 18]} rows={3} label={t('flows.loading')} /> : null;
  } else if (flows.length === 0) {
    body = <EmptyState title={t('flows.emptyTitle')} text={t('flows.emptyText')} action={<Button onClick={openCreateFlow}>{t('nav.createFlow')}</Button>} />;
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        title={t('flows.noMatchTitle')}
        text={t('flows.noMatchText')}
        action={<Button onClick={() => { setScope('all'); setSearch(''); }}>{t('flows.clear')}</Button>}
      />
    );
  } else {
    body = <Table label={t('flows.table')} columns={columns} rows={shown} rowKey={(f) => f.id} />;
  }

  return (
    <ScreenFrame breadcrumb={<span>{t('flows.screen.crumb')}</span>} title={t('flows.screen.title')} subtitle={me?.role === 'admin' ? `${t('flows.screen.subtitle')} ${t('flows.adminNote')}` : t('flows.screen.subtitle')}>
      <div className={styles.toolbar}>
        <ChipGroup label={t('flows.filterLabel')}>
          {([['all', t('flows.all')], ['personal', t('flows.personal')], ['shared', t('flows.shared')]] as const).map(([key, label]) => (
            <Chip key={key} pressed={scope === key} onClick={() => setScope(key)}>
              {label}
            </Chip>
          ))}
        </ChipGroup>
        <span className={styles.search}>
          <SearchField label={t('flows.search')} placeholder={t('flows.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </span>
      </div>
      <Card flush title={t('flows.table')}>
        <div className={styles.tableSlot} aria-busy={data.loading ? 'true' : undefined}>
          {body}
        </div>
      </Card>
      {toDelete ? (
        <Dialog
          title={t('flows.confirmTitle', { name: toDelete.name })}
          onClose={() => setToDelete(null)}
          actions={
            <>
              <Button onClick={() => setToDelete(null)}>{t('flows.cancel')}</Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                {t('flows.delete')}
              </Button>
            </>
          }
        >
          {t('flows.confirmText', { versions: toDelete.versions.length })}
          {deleteError ? <ErrorState what={t('flows.deleteFailed')} next={deleteError} /> : null}
        </Dialog>
      ) : null}
    </ScreenFrame>
  );
}
