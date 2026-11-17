import type { ComponentType } from 'react';
import type { FlowDefinition, FlowNode, NodeType } from '../../../engine/flow/types';

export interface FormProps {
  step: FlowNode;
  definition: FlowDefinition;
  /** Called with the complete new settings of the step, only when they are valid for the form. */
  onSettings: (settings: Record<string, unknown>) => void;
  readOnly: boolean;
}

export type FormComponent = ComponentType<FormProps>;
export type FormRegistry = Partial<Record<NodeType, FormComponent>>;
