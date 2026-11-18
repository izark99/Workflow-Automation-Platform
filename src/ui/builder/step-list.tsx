import { Button, InfoTip } from '../components';
import type { NodeType } from '../../engine/flow/types';
import { STEP_CATALOG, STEP_GROUPS } from './graph';
import { strings } from '../strings';
import styles from './builder.module.css';

/** The drag payload type. Dragging is the mouse path; the buttons are the keyboard path (Enter or Space adds the step). */
export const DRAG_TYPE = 'application/x-dfw-step';

export function StepList({ onAdd, disabled }: { onAdd: (type: NodeType) => void; disabled: boolean }) {
  const t = strings.builder;
  return (
    <aside aria-label={t.stepTypes} className={styles.stepList}>
      <div className={styles.titleRow}>
        <h2>{t.addStep}</h2>
        <InfoTip label={t.addStep}>{t.addStepHint}</InfoTip>
      </div>
      {STEP_GROUPS.map((g) => (
        <div key={g.label} role="group" aria-label={g.label} style={{ display: 'contents' }}>
          <span className={styles.group} aria-hidden="true">
            {g.label}
          </span>
          {g.types.map((type) => (
            <Button
              key={type}
              compact
              block
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(type)}
              aria-label={`${t.add} ${STEP_CATALOG[type].label}`}
            >
              {STEP_CATALOG[type].label}
            </Button>
          ))}
        </div>
      ))}
    </aside>
  );
}
