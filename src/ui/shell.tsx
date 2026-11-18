import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, Dialog, Dropdown, ErrorState, Field, Icon, ToastProvider } from './components';
import type { IconName } from './components';
import { useAuth } from './auth-gate';
import { useLoad, useStore } from './store-context';
import { ThemeSwitch } from './theme-switch';
import { useT, errorText } from './i18n';
import styles from './shell.module.css';

/** What the shell offers to the screen inside it (read with `useOutletContext`). */
export interface ShellContext {
  openCreateFlow: () => void;
}

function NavItem({ to, icon, children }: { to: string; icon: IconName; children: string }) {
  return (
    <NavLink to={to} className={styles.link}>
      <Icon name={icon} size={18} />
      {children}
    </NavLink>
  );
}

function CreateFlowDialog({ admin, onClose }: { admin: boolean; onClose: () => void }) {
  const store = useStore();
  const navigate = useNavigate();
  const t = useT();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'personal' | 'shared'>('personal');
  const [error, setError] = useState<{ what: string; next: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    if (!name.trim()) {
      setError({ what: t('flows.createDialog.emptyName'), next: t('flows.createDialog.emptyNameNext') });
      return;
    }
    setBusy(true);
    try {
      const flow = await store.createFlow({ name, scope });
      navigate(`/flows/${flow.id}/versions/1`);
      onClose();
    } catch (e) {
      setError({ what: t('flows.createDialog.failed'), next: errorText(e) });
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('flows.createDialog.title')}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('flows.createDialog.cancel')}</Button>
          <Button variant="primary" busy={busy} onClick={() => void create()}>
            {t('flows.createDialog.create')}
          </Button>
        </>
      }
    >
      <form
        className={styles.dialogForm}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label={t('flows.createDialog.name')} placeholder={t('flows.createDialog.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        {admin ? (
          <Dropdown
            label={t('flows.createDialog.scope')}
            options={[
              { value: 'personal', label: t('flows.createDialog.personal') },
              { value: 'shared', label: t('flows.createDialog.shared') },
            ]}
            value={scope}
            onChange={(v) => setScope(v as 'personal' | 'shared')}
            width={200}
          />
        ) : null}
        {error ? <ErrorState what={error.what} next={error.next} /> : null}
      </form>
    </Dialog>
  );
}

/** The frame of every screen except the builder: sidebar 232 px and the main column (32 px 40 px, 24 px between blocks). */
export function Shell() {
  const t = useT();
  const user = useLoad((s) => s.currentUser());
  const [creating, setCreating] = useState(false);
  const [signOutProblem, setSignOutProblem] = useState(false);
  const auth = useAuth();
  const me = user.data;
  return (
    <ToastProvider>
    <div className={styles.frame}>
      <nav aria-label={t('nav.label')} className={styles.nav}>
        <div className={styles.brand}>
          <Icon name="flow" size={22} />
          {t('app.brand')}
        </div>
        <div className={styles.create}>
          <Button variant="cta" onClick={() => setCreating(true)}>
            {t('nav.createFlow')}
          </Button>
        </div>
        <NavItem to="/flows" icon="flow">
          {t('nav.flows')}
        </NavItem>
        <NavItem to="/reference-tables" icon="table">
          {t('nav.refTables')}
        </NavItem>
        {me?.role === 'admin' ? (
          <NavItem to="/admin" icon="shield">
            {t('nav.admin')}
          </NavItem>
        ) : null}
        {me ? (
          <div className={styles.user}>
            <span className={styles.userName} data-user-content>{me.name}</span>
            <span className={styles.userRole}>{t(me.role === 'admin' ? 'nav.role.admin' : 'nav.role.user')}</span>
            <div className={styles.prefs}>
              <ThemeSwitch />
            </div>
            {auth ? (
              <div className={styles.signOut}>
                <Button
                  compact
                  onClick={() => {
                    setSignOutProblem(false);
                    auth.signOut().catch(() => setSignOutProblem(true));
                  }}
                >
                  {t('nav.signOut')}
                </Button>
                {signOutProblem ? <span role="alert" className={styles.signOutProblem}>{t('nav.signOutFailed')}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
      <main className={styles.main}>
        <Outlet context={{ openCreateFlow: () => setCreating(true) } satisfies ShellContext} />
      </main>
      {creating ? <CreateFlowDialog admin={me?.role === 'admin'} onClose={() => setCreating(false)} /> : null}
    </div>
    </ToastProvider>
  );
}
