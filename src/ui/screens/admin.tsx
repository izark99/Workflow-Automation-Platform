import { useState } from 'react';
import { Button, Card, Checkbox, Dialog, Dropdown, EmptyState, ErrorState, Field, InfoTip, ScreenFrame, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { StoreError } from '../../store/types';
import type { FlowRecord, Group, User } from '../../store/types';
import { useLoad, useStore } from '../store-context';
import { useT, errorText } from '../i18n';
import type { MessageKey } from '../i18n';
import { deletedOn, groupsText, keptUntil, memberCount, toggleGroup, userFormProblem } from './admin-logic';
import type { UserForm } from './admin-logic';
import styles from './admin.module.css';

type Dialogs = { kind: 'user'; user: User | null } | { kind: 'group'; group: Group | null } | { kind: 'deleteGroup'; group: Group } | { kind: 'purge'; flow: FlowRecord } | null;

const message = (e: unknown, fallback: string): string => errorText(e, fallback);

/** Admin: users, groups, access of groups to shared flows, and deleted flows with restore. */
export function AdminScreen() {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const data = useLoad(async (s) => {
    const me = await s.currentUser();
    if (me.role !== 'admin') throw new StoreError('forbidden', t('admin.forbidden'));
    // A flow that was deleted more than 30 days ago is removed for good when the admin opens this screen.
    await s.purgeExpired();
    return { users: await s.listUsers(), groups: await s.listGroups(), flows: await s.listFlows(), deleted: await s.listDeletedFlows() };
  });
  const showSkeleton = useDelayedLoading(data.loading && !data.data);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const d = data.data;
  const open = (next: Dialogs): void => {
    setDialogError(null);
    setDialog(next);
  };
  /** Runs a store change; on success closes the dialog, reloads and says what happened. */
  const run = async (change: () => Promise<unknown>, done: string | null, fallback: string, inDialog: boolean): Promise<void> => {
    setBusy(true);
    setDialogError(null);
    setProblem(null);
    try {
      await change();
      setDialog(null);
      data.reload();
      if (done) toast(done);
    } catch (e) {
      if (inDialog) setDialogError(message(e, fallback));
      else setProblem(message(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (data.error) {
    const forbidden = data.error instanceof StoreError && data.error.code === 'forbidden';
    body = <ErrorState what={forbidden ? t('admin.forbidden') : t('admin.loadFailed')} next={forbidden ? t('admin.forbiddenNext') : errorText(data.error)} />;
  } else if (!d) {
    body = showSkeleton ? <SkeletonTable weights={[16, 24, 10, 20, 12]} rows={3} label={t('admin.loading')} /> : null;
  } else {
    const shared = d.flows.filter((f) => f.scope === 'shared');
    const userColumns: Column<User>[] = [
      { key: 'name', header: t('admin.userCols.name'), userContent: true, render: (u) => <b>{u.name}</b> },
      { key: 'email', header: t('admin.userCols.email'), userContent: true, render: (u) => u.email },
      { key: 'role', header: t('admin.userCols.role'), render: (u) => t(`admin.roles.${u.role}` as MessageKey) },
      { key: 'groups', header: t('admin.userCols.groups'), userContent: true, render: (u) => groupsText(u, d.groups) },
      { key: 'actions', header: t('admin.userCols.actions'), render: (u) => <Button compact aria-label={t('admin.userDialogEdit', { name: u.name })} onClick={() => open({ kind: 'user', user: u })}>{t('admin.edit')}</Button> },
    ];
    const groupColumns: Column<Group>[] = [
      { key: 'name', header: t('admin.groupCols.name'), userContent: true, render: (g) => <b>{g.name}</b> },
      { key: 'members', header: t('admin.groupCols.members'), align: 'right', render: (g) => memberCount(g, d.users) },
      {
        key: 'actions',
        header: t('admin.groupCols.actions'),
        render: (g) => (
          <div className={styles.actions}>
            <Button compact aria-label={t('admin.renameGroup', { name: g.name })} onClick={() => open({ kind: 'group', group: g })}>{t('admin.rename')}</Button>
            <Button compact variant="danger" aria-label={t('admin.deleteGroupLabel', { name: g.name })} onClick={() => open({ kind: 'deleteGroup', group: g })}>{t('admin.delete')}</Button>
          </div>
        ),
      },
    ];
    const accessColumns: Column<FlowRecord>[] = [
      { key: 'flow', header: t('admin.accessCols.flow'), userContent: true, render: (f) => <b>{f.name}</b> },
      ...d.groups.map((g) => ({
        key: g.id,
        header: g.name,
        userContent: true,
        render: (f: FlowRecord) => (
          <div className={styles.check}>
            <Checkbox
              checked={f.groupIds.includes(g.id)}
              label={t('admin.access', { group: g.name, flow: f.name })}
              onChange={(on) => void run(() => store.setFlowGroups(f.id, toggleGroup(f, d.groups, g.id, on)), t('admin.accessSaved'), t('admin.accessFailed'), false)}
            />
          </div>
        ),
      })),
    ];
    const deletedColumns: Column<FlowRecord>[] = [
      { key: 'flow', header: t('admin.deletedCols.flow'), userContent: true, render: (f) => <b>{f.name}</b> },
      { key: 'owner', header: t('admin.deletedCols.owner'), userContent: true, render: (f) => f.ownerName ?? '' },
      { key: 'on', header: t('admin.deletedCols.deletedOn'), render: (f) => deletedOn(f.deletedAt ?? '') },
      { key: 'until', header: t('admin.deletedCols.keptUntil'), render: (f) => keptUntil(f.deletedAt ?? '') },
      {
        key: 'actions',
        header: t('admin.deletedCols.actions'),
        render: (f) => (
          <div className={styles.actions}>
            <Button compact aria-label={t('admin.restoreFlow', { name: f.name })} onClick={() => void run(() => store.restoreFlow(f.id), t('admin.restored', { name: f.name }), t('admin.deletedFailed'), false)}>{t('admin.restore')}</Button>
            <Button compact variant="danger" aria-label={t('admin.deleteForGoodFlow', { name: f.name })} onClick={() => open({ kind: 'purge', flow: f })}>{t('admin.deleteForGood')}</Button>
          </div>
        ),
      },
    ];
    const section = (title: string, text: string | null, action: React.ReactNode, children: React.ReactNode) => (
      <Card flush title={title}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2>{title}</h2>
            {text ? <span className={styles.note}>{text}</span> : null}
          </div>
          {action}
        </div>
        {children}
      </Card>
    );
    body = (
      <>
        {problem ? <ErrorState what={t('admin.deletedFailed')} next={problem} /> : null}
        {section(
          t('admin.usersTitle'),
          null,
          <Button onClick={() => open({ kind: 'user', user: null })}>{t('admin.invite')}</Button>,
          <>
            <Table label={t('admin.usersTitle')} columns={userColumns} rows={d.users} rowKey={(u) => u.id} />
            <div className={styles.foot}><p className={styles.note}>{t('admin.usersCount', { n: d.users.length })}</p></div>
          </>,
        )}
        {section(t('admin.groupsTitle'), null, <Button onClick={() => open({ kind: 'group', group: null })}>{t('admin.newGroup')}</Button>, <Table label={t('admin.groupsTitle')} columns={groupColumns} rows={d.groups} rowKey={(g) => g.id} />)}
        {section(
          t('admin.accessTitle'),
          t('admin.accessText'),
          null,
          shared.length === 0 ? <EmptyState title={t('admin.noShared')} text="" action={null} /> : <Table label={t('admin.accessTitle')} columns={accessColumns} rows={shared} rowKey={(f) => f.id} />,
        )}
        {section(
          t('admin.deletedTitle'),
          t('admin.deletedText'),
          null,
          d.deleted.length === 0 ? <div className={styles.foot}><p className={styles.note}>{t('admin.noDeleted')}</p></div> : <Table label={t('admin.deletedTitle')} columns={deletedColumns} rows={d.deleted} rowKey={(f) => f.id} />,
        )}

        {dialog?.kind === 'user' ? (
          <UserDialog
            user={dialog.user}
            groups={d.groups}
            busy={busy}
            error={dialogError}
            onCancel={() => setDialog(null)}
            onSave={(f) => void run(() => store.saveUser({ id: dialog.user?.id ?? '', name: f.name, email: f.email, role: f.role, groupIds: f.groupIds }), dialog.user ? null : t('admin.userAdded', { name: f.name.trim() }), t('admin.userSaveFailed'), true)}
          />
        ) : null}
        {dialog?.kind === 'group' ? <GroupDialog group={dialog.group} busy={busy} error={dialogError} onCancel={() => setDialog(null)} onSave={(name) => void run(() => store.saveGroup({ id: dialog.group?.id, name }), null, t('admin.groupSaveFailed'), true)} /> : null}
        {dialog?.kind === 'deleteGroup' ? (
          <Dialog
            title={t('admin.groupDeleteTitle', { name: dialog.group.name })}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t('admin.cancel')}</Button>
                <Button variant="danger" busy={busy} onClick={() => void run(() => store.deleteGroup(dialog.group.id), null, t('admin.groupSaveFailed'), true)}>{t('admin.delete')}</Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <span>{t('admin.groupDeleteText', { members: memberCount(dialog.group, d.users), flows: shared.filter((f) => f.groupIds.includes(dialog.group.id)).length })}</span>
              {dialogError ? <ErrorState what={t('admin.groupSaveFailed')} next={dialogError} /> : null}
            </div>
          </Dialog>
        ) : null}
        {dialog?.kind === 'purge' ? (
          <Dialog
            title={t('admin.purgeTitle', { name: dialog.flow.name })}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t('admin.cancel')}</Button>
                <Button variant="danger" busy={busy} onClick={() => void run(() => store.purgeFlow(dialog.flow.id), t('admin.purged', { name: dialog.flow.name }), t('admin.deletedFailed'), true)}>{t('admin.deleteForGood')}</Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <span>{t('admin.purgeText')}</span>
              {dialogError ? <ErrorState what={t('admin.deletedFailed')} next={dialogError} /> : null}
            </div>
          </Dialog>
        ) : null}
      </>
    );
  }

  return (
    <ScreenFrame breadcrumb={<span>{t('admin.screen.crumb')}</span>} title={t('admin.screen.title')} subtitle={t('admin.screen.subtitle')}>
      {body}
    </ScreenFrame>
  );
}

function UserDialog({ user, groups, busy, error, onSave, onCancel }: { user: User | null; groups: Group[]; busy: boolean; error: string | null; onSave: (f: UserForm) => void; onCancel: () => void }) {
  const t = useT();
  const [f, setF] = useState<UserForm>({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'user', groupIds: user?.groupIds ?? [] });
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={user ? t('admin.userDialogEdit', { name: user.name }) : t('admin.userDialogNew')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('admin.cancel')}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              const p = userFormProblem(f);
              setLocal(p ?? null);
              if (!p) onSave(f);
            }}
          >
            {user ? t('admin.save') : t('admin.inviteConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t('admin.userName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label={t('admin.userEmail')} hint={user ? undefined : t('admin.inviteHint')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>{t('admin.userRole')}</span>
          <Dropdown label={t('admin.userRole')} options={(['user', 'admin'] as const).map((r) => ({ value: r, label: t(`admin.roles.${r}` as MessageKey) }))} value={f.role} width={200} onChange={(role) => setF({ ...f, role: role as UserForm['role'] })} />
        </div>
        <div className={styles.groupBoxes} role="group" aria-label={t('admin.userGroups')}>
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>
            {t('admin.userGroups')}
            <InfoTip label={t('admin.userGroups')}>{t('admin.userGroupsHint')}</InfoTip>
          </span>
          {groups.map((g) => (
            <Checkbox key={g.id} checked={f.groupIds.includes(g.id)} onChange={(on) => setF({ ...f, groupIds: on ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id) })}>
              <span data-user-content>{g.name}</span>
            </Checkbox>
          ))}
        </div>
        {local ? <ErrorState what={t('admin.userSaveFailed')} next={local} /> : null}
        {error ? <ErrorState what={t('admin.userSaveFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

function GroupDialog({ group, busy, error, onSave, onCancel }: { group: Group | null; busy: boolean; error: string | null; onSave: (name: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState(group?.name ?? '');
  return (
    <Dialog
      title={group ? t('admin.groupDialogRename', { name: group.name }) : t('admin.groupDialogNew')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('admin.cancel')}</Button>
          <Button variant="primary" busy={busy} onClick={() => onSave(name)}>
            {t('admin.save')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t('admin.groupName')} value={name} onChange={(e) => setName(e.target.value)} />
        {error ? <ErrorState what={t('admin.groupSaveFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

