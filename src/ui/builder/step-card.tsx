import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { FlowNode } from '../../engine/flow/types';
import { STEP_CATALOG } from './graph';
import styles from './builder.module.css';

export interface StepCardData extends Record<string, unknown> {
  step: FlowNode;
  number: number;
  inputs: string[];
  outputs: readonly string[];
}

export type StepCardNode = Node<StepCardData, 'step'>;

const HANDLE_NAMES: Record<string, string> = { in: '', out: '', in1: '', in2: '', in3: '', match: 'match', nomatch: 'no match', left: 'left', right: 'right' };
const handleName = (h: string): string => HANDLE_NAMES[h] ?? h;
const at = (i: number, n: number): string => `${((i + 1) / (n + 1)) * 100}%`;

/** A step as a 240 x 56 px card: number, name and type. Inputs sit on top, outputs at the bottom. */
export function StepCard({ data, selected }: NodeProps<StepCardNode>) {
  const { step, number, inputs, outputs } = data;
  return (
    <div className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      {inputs.map((h, i) => (
        <Handle key={`in-${h}`} id={h} type="target" position={Position.Top} style={{ left: at(i, inputs.length) }} />
      ))}
      <span className={styles.number} aria-hidden="true">
        {number}
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardTitle}>{step.label ?? step.id}</span>
        <span className={styles.cardSub}>{STEP_CATALOG[step.type].label}</span>
      </span>
      {outputs.map((h, i) => (
        <Handle key={`out-${h}`} id={h} type="source" position={Position.Bottom} style={{ left: at(i, outputs.length) }} />
      ))}
      {outputs.length > 1
        ? outputs.map((h, i) => (
            <span key={`label-${h}`} className={styles.handleLabel} style={{ left: at(i, outputs.length), bottom: -22, transform: 'translateX(-50%)' }} aria-hidden="true">
              {handleName(h)}
            </span>
          ))
        : null}
    </div>
  );
}
