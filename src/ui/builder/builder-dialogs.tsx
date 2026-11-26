import { useState } from 'react';
import { Button, DatePicker, Dialog, ErrorState, Field, QuietWarning, Switch } from '../components';
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

export function PublishDialog({ versionNo, text, dirty, busy, error, warnings = [], onConfirm, onCancel }: { versionNo: number; text: string; dirty: boolean; busy: boolean; error: string | null; /** The date check: gaps in the versions of the tables the flow reads. They do not block the publish. */ warnings?: string[]; onConfirm: () => void; onCancel: () => void }) {
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
        <QuietWarning lines={warnings} />
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

/** Changes the first and the last day of a draft version (flows and reference tables). A published version has no such dialog: it is read-only. */
export function EditDatesDialog({ versionNo, from, to, busy, error, check, onSave, onCancel }: { versionNo: number; from: string; to: string | null; busy: boolean; error: string | null; /** Why these dates cannot be used (versions cannot overlap), or undefined. */ check: (validFrom: string, validTo: string | null) => string | undefined; onSave: (validFrom: string, validTo: string | null) => void; onCancel: () => void }) {
  const t = useT();
  const [validFrom, setValidFrom] = useState(from);
  const [open, setOpen] = useState(to === null);
  const [validTo, setValidTo] = useState(to ?? from);
  const end = open ? null : validTo;
  const problem = check(validFrom, end);
  return (
    <Dialog
      title={t('builder.editDatesTitle', { n: versionNo })}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('builder.cancel')}</Button>
          <Button variant="primary" busy={busy} disabled={!!problem || !validFrom} onClick={() => onSave(validFrom, end)}>
            {t('builder.datesSave')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{t('builder.editDatesText')}</span>
        <DatePicker label={t('builder.validFrom')} value={validFrom} onChange={setValidFrom} width={200} />
        <Switch checked={open} onChange={(on) => { setOpen(on); if (!on) setValidTo(validFrom); }}>
          {t('builder.noEnd')}
        </Switch>
        {open ? null : <DatePicker label={t('builder.validTo')} value={validTo} onChange={setValidTo} width={200} />}
        {problem ? <ErrorState what={t('builder.startClash')} next={problem} /> : null}
        {error ? <ErrorState what={t('builder.datesFailed')} next={error} /> : null}
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
