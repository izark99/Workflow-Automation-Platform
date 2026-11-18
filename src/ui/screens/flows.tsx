import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, Chip, ChipGroup, Dialog, EmptyState, ErrorState, ScreenFrame, SearchField, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import type { ShellContext } from '../shell';
import { useLoad, useStore } from '../store-context';
import { strings } from '../strings';
import type { FlowRecord } from '../../store/types';
import { canDeleteFlow, canRunFlow, describeRange, describeSteps, filterFlows, todayIso, versionInEffect, versionToOpen } from './flows-logic';
import type { ScopeFilter } from './flows-logic';
import styles from './flows.module.css';

const t = strings.flowsScreen;

export function FlowsScreen() {
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
      toast(t.deleted(toDelete.name));
      setToDelete(null);
      data.reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t.deleteFailed);
    }
  };

  const flows = data.data?.flows ?? [];
  const me = data.data?.me;
  const shown = filterFlows(flows, scope, search);

  const columns: Column<FlowRecord>[] = [
    {
      key: 'flow',
      header: t.cols.flow,
      render: (f) => (
        <>
          <b>{f.name}</b>
          <br />
          <span className={styles.sub}>{describeSteps((versionToOpen(f, today) ?? f.versions[0])?.definition)}</span>
        </>
      ),
    },
    {
      key: 'scope',
      header: t.cols.scope,
      render: (f) => (
        <>
          <Badge tone={f.scope === 'shared' ? 'outline' : 'soft'}>{f.scope === 'shared' ? t.shared : t.personal}</Badge>
          <br />
          <span className={styles.sub}>{f.scope === 'shared' ? (f.groupNames ?? []).join(', ') || '-' : t.onlyOwner}</span>
        </>
      ),
    },
    { key: 'owner', header: t.cols.owner, render: (f) => f.ownerName ?? '' },
    {
      key: 'version',
      header: t.cols.version,
      render: (f) => {
        const v = versionInEffect(f, today) ?? versionToOpen(f, today);
        return v ? (
          <>
            v{v.versionNo} <Badge tone="soft">{v.status === 'published' ? t.published : t.draft}</Badge>
          </>
        ) : null;
      },
    },
    { key: 'range', header: t.cols.range, render: (f) => describeRange(versionInEffect(f, today)) },
    {
      key: 'actions',
      header: t.cols.actions,
      render: (f) => {
        const open = versionToOpen(f, today);
        return (
          <div className={styles.actions}>
            <ButtonLink compact to={`/flows/${f.id}/versions/${open?.versionNo ?? 1}`} aria-label={`${t.open} ${f.name}`}>
              {t.open}
            </ButtonLink>
            {canRunFlow(f) ? (
              <ButtonLink compact variant="primary" to={`/flows/${f.id}/run`} aria-label={`${t.run} ${f.name}`}>
                {t.run}
              </ButtonLink>
            ) : null}
            {me && canDeleteFlow(me, f) ? (
              <Button compact variant="danger" aria-label={`${t.delete} ${f.name}`} onClick={() => { setDeleteError(null); setToDelete(f); }}>
                {t.delete}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  let body;
  if (data.error) {
    body = <ErrorState what={strings.loadFailed} next={strings.loadFailedNext} actions={<Button compact onClick={data.reload}>{t.retry}</Button>} />;
  } else if (data.loading) {
    body = showSkeleton ? <SkeletonTable weights={[30, 16, 8, 14, 14, 18]} rows={3} label={t.loading} /> : null;
  } else if (flows.length === 0) {
    body = <EmptyState title={t.emptyTitle} text={t.emptyText} action={<Button variant="primary" onClick={openCreateFlow}>{strings.nav.createFlow}</Button>} />;
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        title={t.noMatchTitle}
        text={t.noMatchText}
        action={<Button variant="primary" onClick={() => { setScope('all'); setSearch(''); }}>{t.clear}</Button>}
      />
    );
  } else {
    body = <Table label={t.table} columns={columns} rows={shown} rowKey={(f) => f.id} />;
  }

  return (
    <ScreenFrame breadcrumb={<span>{strings.screens.flows.crumb}</span>} title={strings.screens.flows.title} subtitle={me?.role === 'admin' ? `${strings.screens.flows.subtitle} ${t.adminNote}` : strings.screens.flows.subtitle}>
      <div className={styles.toolbar}>
        <ChipGroup label={t.filterLabel}>
          {([['all', t.all], ['personal', t.personal], ['shared', t.shared]] as const).map(([key, label]) => (
            <Chip key={key} pressed={scope === key} onClick={() => setScope(key)}>
              {label}
            </Chip>
          ))}
        </ChipGroup>
        <span className={styles.search}>
          <SearchField label={t.search} placeholder={t.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
        </span>
      </div>
      <Card flush title={t.table}>
        <div className={styles.tableSlot} aria-busy={data.loading ? 'true' : undefined}>
          {body}
        </div>
      </Card>
      {toDelete ? (
        <Dialog
          title={t.confirmTitle(toDelete.name)}
          onClose={() => setToDelete(null)}
          actions={
            <>
              <Button onClick={() => setToDelete(null)}>{t.cancel}</Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                {t.delete}
              </Button>
            </>
          }
        >
          {t.confirmText(toDelete.versions.length)}
          {deleteError ? <ErrorState what={t.deleteFailed} next={deleteError} /> : null}
        </Dialog>
      ) : null}
    </ScreenFrame>
  );
}
