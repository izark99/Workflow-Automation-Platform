import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, Dialog, Dropdown, ErrorState, Field, Icon, ToastProvider, useToast } from './components';
import type { IconName } from './components';
import { useAuth } from './auth-gate';
import { useLoad, useStore } from './store-context';
import { NewPasswordForm } from './change-password';
import { LanguageSwitch } from './language-switch';
import { ThemeSwitch } from './theme-switch';
import { useT, errorText } from './i18n';
import { usePanel } from './panels/use-panel';
import { PanelToggle } from './panels/panel-toggle';
import panelStyles from './panels/panel.module.css';
import styles from './shell.module.css';

/** What the shell offers to the screen inside it (read with `useOutletContext`). */
export interface ShellContext {
  openCreateFlow: () => void;
}

function NavItem({ to, icon, children }: { to: string; icon: IconName; children: string }) {
  return (
    <NavLink to={to} className={styles.link}>
      <Icon name={icon} size={20} />
      {children}
    </NavLink>
  );
}

function RailLink({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink to={to} className={styles.railLink} aria-label={label} title={label}>
      <Icon name={icon} size={20} />
    </NavLink>
  );
}

/** Language, theme, change password and sign out: the same controls in the open footer and in the rail's popover. */
function AccountControls({ onChangePassword }: { onChangePassword: () => void }) {
  const t = useT();
  const auth = useAuth();
  const [signOutProblem, setSignOutProblem] = useState(false);
  return (
    <>
      <div className={styles.prefs}>
        <LanguageSwitch width="100%" />
        <ThemeSwitch width="100%" />
      </div>
      {auth ? (
        <div className={styles.signOut}>
          <Button block onClick={onChangePassword}>
            {t('nav.changePassword')}
          </Button>
          <Button
            block
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
    </>
  );
}

/** The one user button of the rail. It opens a popover with the name, the role and the controls of the open footer. */
function UserMenu({ name, role, onChangePassword }: { name: string; role: string; onChangePassword: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      // The language and theme lists are drawn on document.body: a click in them is not outside.
      if (!target || pop.current?.contains(target) || button.current?.contains(target) || target.closest('[role="listbox"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || document.querySelector('[role="listbox"]')) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <>
      <Button ref={button} icon aria-haspopup="dialog" aria-expanded={open} aria-label={t('nav.userMenu')} title={t('nav.userMenu')} onClick={() => setOpen(!open)}>
        <span data-user-content aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      </Button>
      {open ? (
        <div ref={pop} role="dialog" aria-label={t('nav.userMenu')} className={styles.userPopover}>
          <span className={styles.userName} data-user-content>{name}</span>
          <span className={styles.userRole}>{role}</span>
          <AccountControls onChangePassword={() => { setOpen(false); onChangePassword(); }} />
        </div>
      ) : null}
    </>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const auth = useAuth();
  const toast = useToast();
  return (
    <Dialog title={t('nav.changePasswordTitle')} onClose={onClose} actions={<Button onClick={onClose}>{t('nav.cancel')}</Button>}>
      <NewPasswordForm
        submitLabel={t('nav.changePassword')}
        onSave={async (password) => {
          await auth?.changePassword(password);
          toast(t('nav.passwordChanged'));
          onClose();
        }}
      />
    </Dialog>
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
            width="100%"
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
  const [changingPassword, setChangingPassword] = useState(false);
  const { collapsed, toggle } = usePanel('sidebar');
  const me = user.data;
  const roleLabel = me ? t(me.role === 'admin' ? 'nav.role.admin' : 'nav.role.user') : '';
  return (
    <ToastProvider>
    <div className={styles.frame}>
      <nav id="sidebar-body" aria-label={t('nav.label')} className={`${panelStyles.panel} ${styles.nav} ${collapsed ? styles.navRail : ''}`}>
        <div className={styles.toggle}>
          <PanelToggle panel="sidebar" collapsed={collapsed} onToggle={toggle} controls="sidebar-body" />
        </div>
        {collapsed ? (
          <>
            <div className={styles.railTop} />
            <Button variant="primary" icon aria-label={t('nav.createFlow')} title={t('nav.createFlow')} onClick={() => setCreating(true)}>
              <Icon name="plus" size={20} />
            </Button>
            <RailLink to="/flows" icon="workflow" label={t('nav.flows')} />
            <RailLink to="/reference-tables" icon="file-spreadsheet" label={t('nav.refTables')} />
            {me?.role === 'admin' ? <RailLink to="/admin" icon="shield" label={t('nav.admin')} /> : null}
            {me ? (
              <div className={styles.railUser}>
                <UserMenu name={me.name} role={roleLabel} onChangePassword={() => setChangingPassword(true)} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className={styles.brand}>
              <Icon name="workflow" size={24} />
              {t('app.brand')}
            </div>
            <div className={styles.create}>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('nav.createFlow')}
              </Button>
            </div>
            <NavItem to="/flows" icon="workflow">
              {t('nav.flows')}
            </NavItem>
            <NavItem to="/reference-tables" icon="file-spreadsheet">
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
                <span className={styles.userRole}>{roleLabel}</span>
                <AccountControls onChangePassword={() => setChangingPassword(true)} />
              </div>
            ) : null}
          </>
        )}
      </nav>
      <main className={styles.main}>
        <Outlet context={{ openCreateFlow: () => setCreating(true) } satisfies ShellContext} />
      </main>
      {changingPassword ? <ChangePasswordDialog onClose={() => setChangingPassword(false)} /> : null}
      {creating ? <CreateFlowDialog admin={me?.role === 'admin'} onClose={() => setCreating(false)} /> : null}
    </div>
    </ToastProvider>
  );
}
