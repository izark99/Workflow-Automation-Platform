import { useState } from 'react';
import { Button, Card, ErrorState, Field, SkeletonTable, useDelayedLoading, useToast } from '../components';
import { errorText, useT } from '../i18n';
import { useLoad, useStore } from '../store-context';
import { canSaveHours, parseHours } from './admin-settings-logic';
import styles from './admin.module.css';

/** The form once the saved value is known. It is keyed by the saved value, so a saved or reloaded value resets the field. */
function SettingsForm({ saved, onSaved }: { saved: number; onSaved: () => void }) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState(String(saved));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const check = parseHours(text);
  // An error shows once the person has typed, and when Save is pressed; an untouched field shows none.
  const error = touched && !check.ok ? t(check.error) : undefined;

  const save = async (): Promise<void> => {
    setTouched(true);
    if (!check.ok || busy || !canSaveHours(text, saved)) return;
    setBusy(true);
    setFailure(null);
    try {
      await store.saveAppSetting('idle_timeout_hours', check.value);
      toast(t('admin.settings.saved'));
      onSaved();
    } catch (e) {
      setFailure(errorText(e, t('admin.settings.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={styles.settingsForm}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className={styles.settingsField}>
        <Field
          label={t('admin.settings.hours')}
          hint={t('admin.settings.hoursHint')}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          error={error}
          onChange={(e) => {
            setText(e.target.value);
            setTouched(true);
          }}
        />
      </div>
      {failure ? <ErrorState what={t('admin.settings.saveFailed')} next={failure} /> : null}
      <div>
        <Button variant="primary" type="submit" busy={busy} disabled={!canSaveHours(text, saved)}>
          {t('admin.settings.save')}
        </Button>
      </div>
    </form>
  );
}

/** Admin, Settings tab: sign-out after inactivity (SPEC 12.2). */
export function AdminSettings() {
  const t = useT();
  const data = useLoad((s) => s.getAppSettings());
  const showSkeleton = useDelayedLoading(data.loading && !data.data);
  let body;
  if (data.error) body = <ErrorState what={t('admin.settings.loadFailed')} next={errorText(data.error)} actions={<Button compact onClick={data.reload}>{t('flows.retry')}</Button>} />;
  else if (!data.data) body = showSkeleton ? <SkeletonTable weights={[40, 20]} rows={1} label={t('admin.settings.loading')} /> : null;
  else body = <SettingsForm key={data.data.idleTimeoutHours} saved={data.data.idleTimeoutHours} onSaved={data.reload} />;
  return <Card title={t('admin.settings.title')}>{body}</Card>;
}
