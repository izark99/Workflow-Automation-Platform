import { useState } from 'react';
import { Button, Checkbox, Dialog, Dropdown, ErrorState, Field, useToast } from '../components';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { GENERATED_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, generatePassword } from '../../store/accounts';
import type { Role, User } from '../../store/types';
import styles from './admin.module.css';

/** The password of a new account or a reset: a visible field, Generate and Copy. The dialog says once that it is not shown again. */
function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const toast = useToast();
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('admin.passwordCopied'));
    } catch {
      toast(t('admin.copyFailed'));
    }
  };
  return (
    <div className={styles.passwordRow}>
      <div className={styles.passwordField}>
        <Field label={t('admin.password')} hint={t('admin.passwordHint')} value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </div>
      <Button onClick={() => onChange(generatePassword(GENERATED_PASSWORD_LENGTH))}>
        {t('admin.generate')}
      </Button>
      <Button disabled={value === ''} onClick={() => void copy()}>
        {t('admin.copy')}
      </Button>
    </div>
  );
}

export interface CreateInput {
  name: string;
  email: string;
  role: Role;
  password: string;
  mustChangePassword: boolean;
}

/** "Add user": the Create account dialog (DESIGN, Account dialogs). */
export function CreateAccountDialog({ busy, error, onCreate, onCancel }: { busy: boolean; error: string | null; onCreate: (input: CreateInput) => void; onCancel: () => void }) {
  const t = useT();
  const [f, setF] = useState<CreateInput>({ name: '', email: '', role: 'user', password: '', mustChangePassword: true });
  const [local, setLocal] = useState<string | null>(null);
  const check = (): string | null => {
    if (f.name.trim() === '') return t('admin.error.nameEmpty');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return t('admin.error.emailInvalid', { email: f.email.trim() });
    if (f.password.length < MIN_PASSWORD_LENGTH) return t('errors.account.passwordShort', { min: MIN_PASSWORD_LENGTH });
    return null;
  };
  return (
    <Dialog
      title={t('admin.createTitle')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('admin.cancel')}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              const problem = check();
              setLocal(problem);
              if (!problem) onCreate({ ...f, name: f.name.trim(), email: f.email.trim() });
            }}
          >
            {t('admin.createConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t('admin.userName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label={t('admin.userEmail')} value={f.email} autoComplete="off" onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div>
          <span style={{ display: 'block', fontWeight: 500, marginBottom: 'var(--space-2)' }}>{t('admin.userRole')}</span>
          <Dropdown label={t('admin.userRole')} options={(['user', 'admin'] as const).map((r) => ({ value: r, label: t(`admin.roles.${r}` as MessageKey) }))} value={f.role} width="100%" onChange={(role) => setF({ ...f, role: role as Role })} />
        </div>
        <PasswordField value={f.password} onChange={(password) => setF({ ...f, password })} />
        <Checkbox checked={f.mustChangePassword} onChange={(mustChangePassword) => setF({ ...f, mustChangePassword })}>
          {t('admin.mustChange')}
        </Checkbox>
        {local ? <ErrorState what={t('admin.accountFailed')} next={local} /> : null}
        {error ? <ErrorState what={t('admin.accountFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

/** "Reset password" for one user. */
export function ResetPasswordDialog({ user, busy, error, onReset, onCancel }: { user: User; busy: boolean; error: string | null; onReset: (password: string, mustChange: boolean) => void; onCancel: () => void }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={t('admin.resetTitle', { name: user.name })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('admin.cancel')}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              if (password.length < MIN_PASSWORD_LENGTH) {
                setLocal(t('errors.account.passwordShort', { min: MIN_PASSWORD_LENGTH }));
                return;
              }
              setLocal(null);
              onReset(password, mustChange);
            }}
          >
            {t('admin.resetConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <PasswordField value={password} onChange={setPassword} />
        <Checkbox checked={mustChange} onChange={setMustChange}>
          {t('admin.mustChange')}
        </Checkbox>
        {local ? <ErrorState what={t('admin.accountFailed')} next={local} /> : null}
        {error ? <ErrorState what={t('admin.accountFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

/** Lock or unlock, with a confirmation that names the user and says what happens now. */
export function LockDialog({ user, lock, busy, error, onConfirm, onCancel }: { user: User; lock: boolean; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <Dialog
      title={lock ? t('admin.lockTitle', { name: user.name }) : t('admin.unlockTitle', { name: user.name })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('admin.cancel')}</Button>
          <Button variant={lock ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>
            {lock ? t('admin.lockConfirm') : t('admin.unlockConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{lock ? t('admin.lockText', { name: user.name }) : t('admin.unlockText', { name: user.name })}</span>
        {error ? <ErrorState what={t('admin.accountFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}
