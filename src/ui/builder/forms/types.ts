import type { ComponentType } from 'react';
import type { FlowDefinition, FlowNode, NodeType } from '../../../engine/flow/types';
import type { RefTable } from '../../../engine/versions';

/** What a form may need from the builder besides the step: the test files and reference tables, to load columns. */
export interface FormContext {
  testFiles: Record<string, File>;
  refTables: RefTable[];
}

export interface FormProps {
  context: FormContext;
  step: FlowNode;
  definition: FlowDefinition;
  /** Called with the complete new settings of the step, only when they are valid for the form. */
  onSettings: (settings: Record<string, unknown>) => void;
  readOnly: boolean;
}

export type FormComponent = ComponentType<FormProps>;
export type FormRegistry = Partial<Record<NodeType, FormComponent>>;
