import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { Badge, ButtonLink, ErrorState } from '../components';
import { useLoad } from '../store-context';
import { strings } from '../strings';
import { Canvas } from './canvas';
import type { Selection } from './canvas';
import { emptyDefinition } from './graph';
import { SettingsPanel } from './settings-panel';
import { StepList } from './step-list';
import styles from './builder.module.css';

const t = strings.builder;

/** The flow builder: header bar (64 px), step list (184 px) and the canvas. No sidebar on this screen. */
export function BuilderScreen() {
  const { id = '', versionNo = '1' } = useParams();
  const flow = useLoad((s) => s.getFlow(id));
  const version = flow.data?.versions.find((v) => v.versionNo === Number(versionNo));
  const [definition, setDefinition] = useState<FlowDefinition>(emptyDefinition());
  const [selection, setSelection] = useState<Selection>({ nodes: [], edges: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [addRequest, setAddRequest] = useState<{ type: NodeType; n: number } | null>(null);

  useEffect(() => {
    if (version) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the editable copy starts from the loaded version
      setDefinition(structuredClone(version.definition) as FlowDefinition);
      setSelection({ nodes: [], edges: [] });
    }
  }, [version]);

  const readOnly = version?.status === 'published';

  if (flow.error || (!flow.loading && !version)) {
    return (
      <main style={{ padding: '32px 40px' }}>
        <ErrorState what={t.notFound} next={t.notFoundNext} actions={<ButtonLink compact to="/flows">{t.flowsLink}</ButtonLink>} />
      </main>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link to="/flows" className={styles.crumb}>
          {t.flowsLink}
        </Link>
        <span className={styles.slash} aria-hidden="true">
          /
        </span>
        <h1 className={styles.title}>{flow.data?.name ?? ''}</h1>
        {version ? <Badge>{version.status === 'published' ? t.versionBadgePublished : t.versionBadgeDraft}</Badge> : null}
        <div className={styles.barActions}>
          <ButtonLink variant="cta" to={`/flows/${id}/run`}>
            {t.run}
          </ButtonLink>
        </div>
      </header>
      <main className={styles.body}>
        <StepList disabled={readOnly || !version} onAdd={(type) => setAddRequest((r) => ({ type, n: (r?.n ?? 0) + 1 }))} />
        <Canvas
          definition={definition}
          onChange={setDefinition}
          selection={selection}
          onSelect={setSelection}
          message={message}
          onMessage={setMessage}
          readOnly={readOnly}
          addRequest={addRequest}
        />
        <SettingsPanel
          definition={definition}
          step={selection.nodes.length === 1 ? definition.nodes.find((n) => n.id === selection.nodes[0]) : undefined}
          onChange={setDefinition}
          onDeleted={() => setSelection({ nodes: [], edges: [] })}
          readOnly={readOnly}
        />
      </main>
    </div>
  );
}
