import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, Dialog, Dropdown, ErrorState, Field, Icon } from './components';
import type { IconName } from './components';
import { useLoad, useStore } from './store-context';
import { strings } from './strings';
import styles from './shell.module.css';

const t = strings.nav;

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
  const d = strings.createFlowDialog;
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'personal' | 'shared'>('personal');
  const [error, setError] = useState<{ what: string; next: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    if (!name.trim()) {
      setError({ what: d.emptyName, next: d.emptyNameNext });
      return;
    }
    setBusy(true);
    try {
      const flow = await store.createFlow({ name, scope });
      navigate(`/flows/${flow.id}/versions/1`);
      onClose();
    } catch (e) {
      setError({ what: d.failed, next: e instanceof Error ? e.message : '' });
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={d.title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{d.cancel}</Button>
          <Button variant="primary" busy={busy} onClick={() => void create()}>
            {d.create}
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
        <Field label={d.name} placeholder={d.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        {admin ? (
          <Dropdown
            label={d.scope}
            options={[
              { value: 'personal', label: d.personal },
              { value: 'shared', label: d.shared },
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
  const user = useLoad((s) => s.currentUser());
  const [creating, setCreating] = useState(false);
  const me = user.data;
  return (
    <div className={styles.frame}>
      <nav aria-label={t.label} className={styles.nav}>
        <div className={styles.brand}>
          <Icon name="flow" size={22} />
          {strings.brand}
        </div>
        <div className={styles.create}>
          <Button variant="cta" onClick={() => setCreating(true)}>
            {t.createFlow}
          </Button>
        </div>
        <NavItem to="/flows" icon="flow">
          {t.flows}
        </NavItem>
        <NavItem to="/reference-tables" icon="table">
          {t.refTables}
        </NavItem>
        {me?.role === 'admin' ? (
          <NavItem to="/admin" icon="shield">
            {t.admin}
          </NavItem>
        ) : null}
        {me ? (
          <div className={styles.user}>
            <span className={styles.userName}>{me.name}</span>
            <span className={styles.userRole}>{strings.roles[me.role]}</span>
          </div>
        ) : null}
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
      {creating ? <CreateFlowDialog admin={me?.role === 'admin'} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
