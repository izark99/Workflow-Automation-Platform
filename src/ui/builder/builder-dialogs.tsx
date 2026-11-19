import { useState } from 'react';
import { Button, DatePicker, Dialog, ErrorState, Field } from '../components';
import { useT } from '../i18n';
import styles from './builder.module.css';


export function DiscardDialog({ onDiscard, onStay }: { onDiscard: () => void; onStay: () => void }) {
  const t = useT();
  return (
    <Dialog
      title={t('builder.discardTitle')}
      onClose={onStay}
      actions={
        <>
          <Button onClick={onStay}>{t('builder.stay')}</Button>
          <Button variant="danger" onClick={onDiscard}>
            {t('builder.discard')}
          </Button>
        </>
      }
    >
      {t('builder.discardText')}
    </Dialog>
  );
}

export function PublishDialog({ versionNo, text, dirty, busy, error, onConfirm, onCancel }: { versionNo: number; text: string; dirty: boolean; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <Dialog
      title={t('builder.publishTitle', { n: versionNo })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('builder.cancel')}</Button>
          <Button variant="primary" busy={busy} onClick={onConfirm}>
            {t('builder.publish')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{text}</span>
        {dirty ? <span>{t('builder.publishUnsaved')}</span> : null}
        {error ? <ErrorState what={t('builder.publishFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

/** Asks for the day a new version is valid from; the new version is a draft copy of the one that is open. */
export function NewVersionDialog({ fromNo, suggested, busy, error, check, onCreate, onCancel }: { fromNo: number; suggested: string; busy: boolean; error: string | null; /** Why a start day cannot be used (versions cannot overlap), or undefined. */ check?: (date: string) => string | undefined; onCreate: (validFrom: string) => void; onCancel: () => void }) {
  const t = useT();
  const [date, setDate] = useState(suggested);
  const problem = check?.(date);
  return (
    <Dialog
      title={t('builder.newVersionTitle', { n: fromNo })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('builder.cancel')}</Button>
          <Button variant="primary" busy={busy} disabled={!!problem} onClick={() => onCreate(date)}>
            {t('builder.createVersion')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{t('builder.newVersionText')}</span>
        <DatePicker label={t('builder.validFrom')} value={date} onChange={setDate} width={200} />
        {problem ? <ErrorState what={t('builder.startClash')} next={problem} /> : null}
        {error ? <ErrorState what={t('builder.versionFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

export function CopyFlowDialog({ suggested, busy, error, onCreate, onCancel }: { suggested: string; busy: boolean; error: string | null; onCreate: (name: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState(suggested);
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={t('builder.copyTitle')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('builder.cancel')}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              if (!name.trim()) setLocal(`${t('builder.emptyCopyName')} ${t('builder.emptyCopyNameNext')}`);
              else onCreate(name);
            }}
          >
            {t('builder.copyCreate')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t('builder.copyName')} value={name} onChange={(e) => setName(e.target.value)} />
        {local ? <ErrorState what={t('builder.copyFailed')} next={local} /> : null}
        {error ? <ErrorState what={t('builder.copyFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}
