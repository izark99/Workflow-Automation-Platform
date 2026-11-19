import type { ComponentType } from 'react';
import type { FlowDefinition, FlowNode, NodeType } from '../../../engine/flow/types';
import type { ParameterValue } from '../../../engine/flow/parameters';
import type { RefTable } from '../../../engine/versions';

/** What a form may need from the builder besides the step: the test files and reference tables, to load columns. */
export interface FormContext {
  testFiles: Record<string, File>;
  refTables: RefTable[];
  /** Test values of the parameters, by key. */
  parameterValues?: Record<string, ParameterValue | undefined>;
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
/** One form for every step type: the compiler refuses a missing one. */
export type FormRegistry = Record<NodeType, FormComponent>;
