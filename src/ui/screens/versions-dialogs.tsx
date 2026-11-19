import { useState } from 'react';
import type { FlowRecord } from '../../store/types';
import { NewVersionDialog } from '../builder/builder-dialogs';
import { useStore } from '../store-context';
import { translate, errorText } from '../i18n';
import { newVersionProblem, suggestStart } from './versions-logic';

/** The "new version" dialog of the Versions screen: copies `fromNo`, checks the start day against the published versions, creates a draft. */
export function CopyVersionHost({ flow, fromNo, today, onClose, onCreated }: { flow: FlowRecord; fromNo: number; today: string; onClose: () => void; onCreated: (versionNo: number) => void }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <NewVersionDialog
      fromNo={fromNo}
      suggested={suggestStart(flow.versions, today)}
      check={(d) => newVersionProblem(flow.versions, d)}
      busy={busy}
      error={error}
      onCancel={onClose}
      onCreate={(validFrom) => {
        setBusy(true);
        setError(null);
        store.createFlowVersion(flow.id, { validFrom, copyFrom: fromNo }).then(
          (updated) => onCreated(Math.max(...updated.versions.map((v) => v.versionNo))),
          (e: unknown) => {
            setError(errorText(e, translate('builder.versionFailed')));
            setBusy(false);
          },
        );
      }}
    />
  );
}
