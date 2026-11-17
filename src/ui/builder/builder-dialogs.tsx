import { useState } from 'react';
import { Button, DatePicker, Dialog, ErrorState, Field } from '../components';
import { strings } from '../strings';
import styles from './builder.module.css';

const t = strings.builder;

export function DiscardDialog({ onDiscard, onStay }: { onDiscard: () => void; onStay: () => void }) {
  return (
    <Dialog
      title={t.discardTitle}
      onClose={onStay}
      actions={
        <>
          <Button onClick={onStay}>{t.stay}</Button>
          <Button variant="danger" onClick={onDiscard}>
            {t.discard}
          </Button>
        </>
      }
    >
      {t.discardText}
    </Dialog>
  );
}

export function PublishDialog({ versionNo, text, dirty, busy, error, onConfirm, onCancel }: { versionNo: number; text: string; dirty: boolean; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      title={t.publishTitle(versionNo)}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button variant="primary" busy={busy} onClick={onConfirm}>
            {t.publish}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{text}</span>
        {dirty ? <span>{t.publishUnsaved}</span> : null}
        {error ? <ErrorState what={t.publishFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}

/** Asks for the day a new version is valid from; the new version is a draft copy of the one that is open. */
export function NewVersionDialog({ fromNo, suggested, busy, error, onCreate, onCancel }: { fromNo: number; suggested: string; busy: boolean; error: string | null; onCreate: (validFrom: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(suggested);
  return (
    <Dialog
      title={t.newVersionTitle(fromNo)}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button variant="primary" busy={busy} onClick={() => onCreate(date)}>
            {t.createVersion}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <span>{t.newVersionText}</span>
        <DatePicker label={t.validFrom} value={date} onChange={setDate} width={200} />
        {error ? <ErrorState what={t.versionFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}

export function CopyFlowDialog({ suggested, busy, error, onCreate, onCancel }: { suggested: string; busy: boolean; error: string | null; onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(suggested);
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={t.copyTitle}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              if (!name.trim()) setLocal(`${t.emptyCopyName} ${t.emptyCopyNameNext}`);
              else onCreate(name);
            }}
          >
            {t.copyCreate}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t.copyName} value={name} onChange={(e) => setName(e.target.value)} />
        {local ? <ErrorState what={t.copyFailed} next={local} /> : null}
        {error ? <ErrorState what={t.copyFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}
