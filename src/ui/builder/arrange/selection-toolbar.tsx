import { NodeToolbar, Position } from '@xyflow/react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { AlignMode } from '../../../engine/flow/arrange';
import { Button, Icon } from '../../components';
import type { IconName } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import styles from '../builder.module.css';

const ALIGN: { mode: AlignMode; icon: IconName; message: MessageKey }[] = [
  { mode: 'left', icon: 'align-left', message: 'builder.alignLeft' },
  { mode: 'center', icon: 'align-center-h', message: 'builder.alignCenter' },
  { mode: 'right', icon: 'align-right', message: 'builder.alignRight' },
  { mode: 'top', icon: 'align-top', message: 'builder.alignTop' },
  { mode: 'middle', icon: 'align-middle', message: 'builder.alignMiddle' },
  { mode: 'bottom', icon: 'align-bottom', message: 'builder.alignBottom' },
];

export interface SelectionToolbarProps {
  /** The selected steps (two or more). */
  ids: string[];
  /** False while a card is dragged. */
  visible: boolean;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
}

/** The toolbar above the box of the selected steps (SPEC 15.1 item 4). Left and Right move between its buttons. */
export function SelectionToolbar({ ids, visible, onAlign, onDistribute }: SelectionToolbarProps) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[to]?.focus();
  };
  return (
    <NodeToolbar nodeId={ids} isVisible={visible && ids.length >= 2} position={Position.Top} offset={12}>
      <div ref={root} className={styles.selectionToolbar} role="toolbar" aria-label={t('builder.selectionTools')} onKeyDown={move}>
        {ALIGN.map((a) => (
          <Button key={a.mode} size="sm" icon aria-label={t(a.message)} onClick={() => onAlign(a.mode)}>
            <Icon name={a.icon} />
          </Button>
        ))}
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <Button size="sm" icon aria-label={t('builder.distributeH')} disabled={ids.length < 3} onClick={() => onDistribute('horizontal')}>
          <Icon name="distribute-h" />
        </Button>
        <Button size="sm" icon aria-label={t('builder.distributeV')} disabled={ids.length < 3} onClick={() => onDistribute('vertical')}>
          <Icon name="distribute-v" />
        </Button>
      </div>
    </NodeToolbar>
  );
}
