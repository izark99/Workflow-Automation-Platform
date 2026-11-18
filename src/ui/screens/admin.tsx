import { useState } from 'react';
import { Button, Card, Checkbox, Dialog, Dropdown, EmptyState, ErrorState, Field, InfoTip, ScreenFrame, SkeletonTable, Table, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { StoreError } from '../../store/types';
import type { FlowRecord, Group, User } from '../../store/types';
import { useLoad, useStore } from '../store-context';
import { adminStrings as t, strings } from '../strings';
import { deletedOn, groupsText, keptUntil, memberCount, toggleGroup, userFormProblem } from './admin-logic';
import type { UserForm } from './admin-logic';
import styles from './admin.module.css';

type Dialogs = { kind: 'user'; user: User | null } | { kind: 'group'; group: Group | null } | { kind: 'deleteGroup'; group: Group } | { kind: 'purge'; flow: FlowRecord } | null;

const message = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** Admin: users, groups, access of groups to shared flows, and deleted flows with restore. */
export function AdminScreen() {
  const store = useStore();
  const toast = useToast();
  const data = useLoad(async (s) => {
    const me = await s.currentUser();
    if (me.role !== 'admin') throw new StoreError('forbidden', t.forbidden);
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
    body = <ErrorState what={forbidden ? t.forbidden : t.loadFailed} next={forbidden ? t.forbiddenNext : data.error.message} />;
  } else if (!d) {
    body = showSkeleton ? <SkeletonTable weights={[16, 24, 10, 20, 12]} rows={3} label="Loading the admin data" /> : null;
  } else {
    const shared = d.flows.filter((f) => f.scope === 'shared');
    const userColumns: Column<User>[] = [
      { key: 'name', header: t.userCols.name, render: (u) => <b>{u.name}</b> },
      { key: 'email', header: t.userCols.email, render: (u) => u.email },
      { key: 'role', header: t.userCols.role, render: (u) => t.roles[u.role] },
      { key: 'groups', header: t.userCols.groups, render: (u) => groupsText(u, d.groups) },
      { key: 'actions', header: t.userCols.actions, render: (u) => <Button compact aria-label={`${t.edit} ${u.name}`} onClick={() => open({ kind: 'user', user: u })}>{t.edit}</Button> },
    ];
    const groupColumns: Column<Group>[] = [
      { key: 'name', header: t.groupCols.name, render: (g) => <b>{g.name}</b> },
      { key: 'members', header: t.groupCols.members, align: 'right', render: (g) => memberCount(g, d.users) },
      {
        key: 'actions',
        header: t.groupCols.actions,
        render: (g) => (
          <div className={styles.actions}>
            <Button compact aria-label={`${t.rename} ${g.name}`} onClick={() => open({ kind: 'group', group: g })}>{t.rename}</Button>
            <Button compact variant="danger" aria-label={`${t.delete} ${g.name}`} onClick={() => open({ kind: 'deleteGroup', group: g })}>{t.delete}</Button>
          </div>
        ),
      },
    ];
    const accessColumns: Column<FlowRecord>[] = [
      { key: 'flow', header: t.accessCols.flow, render: (f) => <b>{f.name}</b> },
      ...d.groups.map((g) => ({
        key: g.id,
        header: g.name,
        render: (f: FlowRecord) => (
          <div className={styles.check}>
            <Checkbox
              checked={f.groupIds.includes(g.id)}
              label={t.access(g.name, f.name)}
              onChange={(on) => void run(() => store.setFlowGroups(f.id, toggleGroup(f, d.groups, g.id, on)), t.accessSaved, t.accessFailed, false)}
            />
          </div>
        ),
      })),
    ];
    const deletedColumns: Column<FlowRecord>[] = [
      { key: 'flow', header: t.deletedCols.flow, render: (f) => <b>{f.name}</b> },
      { key: 'owner', header: t.deletedCols.owner, render: (f) => f.ownerName ?? '' },
      { key: 'on', header: t.deletedCols.deletedOn, render: (f) => deletedOn(f.deletedAt ?? '') },
      { key: 'until', header: t.deletedCols.keptUntil, render: (f) => keptUntil(f.deletedAt ?? '') },
      {
        key: 'actions',
        header: t.deletedCols.actions,
        render: (f) => (
          <div className={styles.actions}>
            <Button compact aria-label={`${t.restore} ${f.name}`} onClick={() => void run(() => store.restoreFlow(f.id), t.restored(f.name), t.deletedFailed, false)}>{t.restore}</Button>
            <Button compact variant="danger" aria-label={`${t.deleteForGood} ${f.name}`} onClick={() => open({ kind: 'purge', flow: f })}>{t.deleteForGood}</Button>
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
        {problem ? <ErrorState what={t.deletedFailed} next={problem} /> : null}
        {section(
          t.usersTitle,
          null,
          <Button onClick={() => open({ kind: 'user', user: null })}>{t.invite}</Button>,
          <>
            <Table label={t.usersTitle} columns={userColumns} rows={d.users} rowKey={(u) => u.id} />
            <div className={styles.foot}><p className={styles.note}>{t.usersCount(d.users.length)}</p></div>
          </>,
        )}
        {section(t.groupsTitle, null, <Button onClick={() => open({ kind: 'group', group: null })}>{t.newGroup}</Button>, <Table label={t.groupsTitle} columns={groupColumns} rows={d.groups} rowKey={(g) => g.id} />)}
        {section(
          t.accessTitle,
          t.accessText,
          null,
          shared.length === 0 ? <EmptyState title={t.noShared} text="" action={null} /> : <Table label={t.accessTitle} columns={accessColumns} rows={shared} rowKey={(f) => f.id} />,
        )}
        {section(
          t.deletedTitle,
          t.deletedText,
          null,
          d.deleted.length === 0 ? <div className={styles.foot}><p className={styles.note}>{t.noDeleted}</p></div> : <Table label={t.deletedTitle} columns={deletedColumns} rows={d.deleted} rowKey={(f) => f.id} />,
        )}

        {dialog?.kind === 'user' ? (
          <UserDialog
            user={dialog.user}
            groups={d.groups}
            busy={busy}
            error={dialogError}
            onCancel={() => setDialog(null)}
            onSave={(f) => void run(() => store.saveUser({ id: dialog.user?.id ?? '', name: f.name, email: f.email, role: f.role, groupIds: f.groupIds }), dialog.user ? null : `${f.name.trim()} added.`, t.userSaveFailed, true)}
          />
        ) : null}
        {dialog?.kind === 'group' ? <GroupDialog group={dialog.group} busy={busy} error={dialogError} onCancel={() => setDialog(null)} onSave={(name) => void run(() => store.saveGroup({ id: dialog.group?.id, name }), null, t.groupSaveFailed, true)} /> : null}
        {dialog?.kind === 'deleteGroup' ? (
          <Dialog
            title={t.groupDeleteTitle(dialog.group.name)}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t.cancel}</Button>
                <Button variant="danger" busy={busy} onClick={() => void run(() => store.deleteGroup(dialog.group.id), null, t.groupSaveFailed, true)}>{t.delete}</Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <span>{t.groupDeleteText(memberCount(dialog.group, d.users), shared.filter((f) => f.groupIds.includes(dialog.group.id)).length)}</span>
              {dialogError ? <ErrorState what={t.groupSaveFailed} next={dialogError} /> : null}
            </div>
          </Dialog>
        ) : null}
        {dialog?.kind === 'purge' ? (
          <Dialog
            title={t.purgeTitle(dialog.flow.name)}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t.cancel}</Button>
                <Button variant="danger" busy={busy} onClick={() => void run(() => store.purgeFlow(dialog.flow.id), t.purged(dialog.flow.name), t.deletedFailed, true)}>{t.deleteForGood}</Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <span>{t.purgeText}</span>
              {dialogError ? <ErrorState what={t.deletedFailed} next={dialogError} /> : null}
            </div>
          </Dialog>
        ) : null}
      </>
    );
  }

  return (
    <ScreenFrame breadcrumb={<span>{strings.screens.admin.crumb}</span>} title={strings.screens.admin.title} subtitle={strings.screens.admin.subtitle}>
      {body}
    </ScreenFrame>
  );
}

function UserDialog({ user, groups, busy, error, onSave, onCancel }: { user: User | null; groups: Group[]; busy: boolean; error: string | null; onSave: (f: UserForm) => void; onCancel: () => void }) {
  const [f, setF] = useState<UserForm>({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'user', groupIds: user?.groupIds ?? [] });
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={user ? t.userDialogEdit(user.name) : t.userDialogNew}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              const p = userFormProblem(f);
              setLocal(p ?? null);
              if (!p) onSave(f);
            }}
          >
            {user ? t.save : t.inviteConfirm}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t.userName} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label={t.userEmail} hint={user ? undefined : t.inviteHint} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>{t.userRole}</span>
          <Dropdown label={t.userRole} options={(['user', 'admin'] as const).map((r) => ({ value: r, label: t.roles[r] }))} value={f.role} width={200} onChange={(role) => setF({ ...f, role: role as UserForm['role'] })} />
        </div>
        <div className={styles.groupBoxes} role="group" aria-label={t.userGroups}>
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>
            {t.userGroups}
            <InfoTip label={t.userGroups}>{t.userGroupsHint}</InfoTip>
          </span>
          {groups.map((g) => (
            <Checkbox key={g.id} checked={f.groupIds.includes(g.id)} onChange={(on) => setF({ ...f, groupIds: on ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id) })}>
              {g.name}
            </Checkbox>
          ))}
        </div>
        {local ? <ErrorState what={t.userSaveFailed} next={local} /> : null}
        {error ? <ErrorState what={t.userSaveFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}

function GroupDialog({ group, busy, error, onSave, onCancel }: { group: Group | null; busy: boolean; error: string | null; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  return (
    <Dialog
      title={group ? t.groupDialogRename(group.name) : t.groupDialogNew}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button variant="primary" busy={busy} onClick={() => onSave(name)}>
            {t.save}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t.groupName} value={name} onChange={(e) => setName(e.target.value)} />
        {error ? <ErrorState what={t.groupSaveFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}

