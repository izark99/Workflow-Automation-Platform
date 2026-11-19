import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Button } from '../components';
import { FIT_VIEW_OPTIONS } from './fit-view';
import { useT } from '../i18n';
import styles from './builder.module.css';

/** Own zoom controls: the built-in ones are 26 px buttons, and the design allows only 36 and 40 px. */
export function ZoomControls({ summary }: { summary: string }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const t = useT();
  return (
    <Panel position="bottom-left">
      <div className={styles.toolbar} role="toolbar" aria-label={t('builder.canvasTools')}>
        <span className={styles.summary}>{summary}</span>
        <Button compact aria-label={t('builder.zoomOut')} onClick={() => void zoomOut({ duration: 150 })}>
          -
        </Button>
        <span className={styles.zoom} aria-live="polite">{`${Math.round(zoom * 100)}%`}</span>
        <Button compact aria-label={t('builder.zoomIn')} onClick={() => void zoomIn({ duration: 150 })}>
          +
        </Button>
        <Button compact onClick={() => void fitView({ duration: 150, ...FIT_VIEW_OPTIONS })}>
          {t('builder.fit')}
        </Button>
      </div>
    </Panel>
  );
}
