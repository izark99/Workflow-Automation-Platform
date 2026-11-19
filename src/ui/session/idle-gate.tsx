import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Dialog } from '../components';
import { useT } from '../i18n';
import { useStore } from '../store-context';
import { announceAt, idleLimit, LIMIT_POLL_MS } from './idle-gate-logic';
import type { IdleLimit } from './idle-gate-logic';
import { formatCountdown, idleStatus } from './idle-status';
import { activityTracker } from './tracker';
import { useHasUnsaved } from './unsaved';
import styles from './idle-gate.module.css';

/** The development hooks of the tests (`dfw.idleMs`, `dfw.idlePollMs`) exist in a dev build and in the e2e build, not in a release. */
function hook(name: string): number | undefined {
  try {
    if (!(import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true')) return undefined;
    const n = Number(localStorage.getItem(name));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Signs a person out after the hours without activity that the admin set (SPEC 12.2). It reads the limit after sign-in and
 * every 15 minutes, shows the dialog 2 minutes before the limit, and at the limit calls `onExpired` with the hours.
 * The app below is not shown until the limit is read, so a session that is already past its limit shows no data.
 */
export function IdleGate({ onExpired, onSignOut, children }: { onExpired: (hours: number) => void; onSignOut: () => void; children: ReactNode }) {
  const store = useStore();
  const t = useT();
  const [limit, setLimit] = useState<IdleLimit | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');
  const unsaved = useHasUnsaved();
  const expired = useRef(false);

  useEffect(() => {
    let live = true;
    const read = (): void => {
      store.getAppSettings().then(
        (s) => live && setLimit(idleLimit(s.idleTimeoutHours, hook('dfw.idleMs'))),
        // The limit cannot be read: the default applies, so a session never stays open without a limit.
        () => live && setLimit((old) => old ?? idleLimit(undefined, hook('dfw.idleMs'))),
      );
    };
    read();
    const timer = window.setInterval(read, hook('dfw.idlePollMs') ?? LIMIT_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [store]);

  // One tick a second. The announcement for screen readers is set here, from the tick, only at the moments of announceAt().
  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (!limit) return;
      const st = idleStatus(at, activityTracker().last(), limit.limitMs, limit.warnMs);
      if (st.kind !== 'warning') {
        setAnnounce('');
        return;
      }
      const moment = announceAt(st.remainingMs);
      if (moment !== null) setAnnounce(t('session.idle.announce', { time: formatCountdown(moment * 1000) }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [limit, t]);

  const tracker = activityTracker();
  const status = limit ? idleStatus(now, tracker.last(), limit.limitMs, limit.warnMs) : ({ kind: 'active' } as const);

  useEffect(() => {
    if (status.kind === 'expired' && limit && !expired.current) {
      expired.current = true;
      onExpired(limit.hours);
    }
  }, [status.kind, limit, onExpired]);

  const remainingMs = status.kind === 'warning' ? status.remainingMs : 0;

  if (!limit) return <div role="status" aria-busy="true" aria-label={t('signIn.checking')} />;
  return (
    <>
      {children}
      {status.kind === 'warning' ? (
        <Dialog
          title={t('session.idle.title')}
          onClose={() => tracker.touch(true)}
          actions={
            <>
              <Button onClick={onSignOut}>{t('session.idle.signOut')}</Button>
              <Button variant="primary" onClick={() => tracker.touch(true)}>
                {t('session.idle.stay')}
              </Button>
            </>
          }
        >
          <p className={styles.text}>{t('session.idle.text', { time: formatCountdown(remainingMs) })}</p>
          {unsaved ? <p className={styles.unsaved}>{t('session.idle.unsaved')}</p> : null}
          <span className={styles.srOnly} role="status" aria-live="polite">
            {announce}
          </span>
        </Dialog>
      ) : null}
    </>
  );
}
