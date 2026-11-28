import { useRef } from 'react';
import { Button, Icon, InfoTip } from '../components';
import type { NodeType } from '../../engine/flow/types';
import { STEP_CATALOG, STEP_GROUPS } from './graph';
import { STEP_ICONS } from './step-icons';
import { useT } from '../i18n';
import { usePanel } from '../panels/use-panel';
import { PanelToggle } from '../panels/panel-toggle';
import { usePanelMotion } from '../panels/use-panel-motion';
import { countRender } from './render-counter';
import styles from './builder.module.css';

/** The drag payload type. Dragging is the mouse path; the buttons are the keyboard path (Enter or Space adds the step). */
export const DRAG_TYPE = 'application/x-dfw-step';

export function StepList({ onAdd, disabled }: { onAdd: (type: NodeType) => void; disabled: boolean }) {
  countRender('StepList');
  const t = useT();
  const { collapsed, toggle } = usePanel('steps');
  const ref = useRef<HTMLElement>(null);
  usePanelMotion(ref);
  return (
    <aside ref={ref} id="builder-steps" aria-label={t('builder.stepTypes')} className={`${styles.stepList} ${collapsed ? styles.stepListRail : ''}`}>
      <span className={styles.glass} aria-hidden="true" />
      <div className={styles.stepToggle}>
        <PanelToggle panel="steps" collapsed={collapsed} onToggle={toggle} controls="builder-steps" />
      </div>
      <div className={styles.stepListScroll}>
      <div className={styles.stepListBody} hidden={collapsed}>
      <div className={styles.titleRow}>
        <h2>{t('builder.addStep')}</h2>
        <InfoTip label={t('builder.addStep')}>{`${t('builder.addStepHint')} ${t('builder.shortcuts')}`}</InfoTip>
      </div>
      {STEP_GROUPS.map((g) => (
        <div key={g.label} role="group" aria-label={g.label} style={{ display: 'contents' }}>
          <span className={styles.group} aria-hidden="true">
            {g.label}
          </span>
          {g.types.map((type) => (
            <Button
              key={type}
              size="sm"
              block
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, type);
                // The data of a drag cannot be read while it is over a target, but its types can: the type of step goes in a type name.
                e.dataTransfer.setData(`${DRAG_TYPE}.${type}`, '1');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(type)}
              aria-label={t('builder.addStepButton', { name: STEP_CATALOG[type].label })}
            >
              <Icon name={STEP_ICONS[type]} />
              {STEP_CATALOG[type].label}
            </Button>
          ))}
        </div>
      ))}
      </div>
      </div>
    </aside>
  );
}
