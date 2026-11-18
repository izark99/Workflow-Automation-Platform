import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Button } from '../components';
import { strings } from '../strings';
import styles from './builder.module.css';

/** Own zoom controls: the built-in ones are 26 px buttons, and the design allows only 36 and 40 px. */
export function ZoomControls({ summary }: { summary: string }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const t = strings.builder;
  return (
    <Panel position="bottom-left">
      <div className={styles.toolbar} role="toolbar" aria-label={t.canvasTools}>
        <span className={styles.summary}>{summary}</span>
        <Button compact aria-label={t.zoomOut} onClick={() => void zoomOut({ duration: 150 })}>
          -
        </Button>
        <span className={styles.zoom} aria-live="polite">{`${Math.round(zoom * 100)}%`}</span>
        <Button compact aria-label={t.zoomIn} onClick={() => void zoomIn({ duration: 150 })}>
          +
        </Button>
        <Button compact onClick={() => void fitView({ duration: 150, padding: 0.2 })}>
          {t.fit}
        </Button>
      </div>
    </Panel>
  );
}
