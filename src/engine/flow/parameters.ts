import { isIsoDate } from '../versions';
import type { FlowDefinition } from './types';

// Flow parameters (SPEC 11.5): values that the user gives on the Run screen and that formulas read with PARAM("key").

export const PARAMETER_TYPES = ['date', 'text', 'number', 'list', 'boolean'] as const;
export type ParameterType = (typeof PARAMETER_TYPES)[number];

/** The value of a parameter: a date is an ISO text, a number is a number, a switch is a boolean. */
export type ParameterValue = string | number | boolean;

export interface FlowParameter {
  /** Letters, digits and underscores, unique in the version without regard to case. */
  key: string;
  /** Shown on the Run screen. */
  label: string;
  type: ParameterType;
  required: boolean;
  /** Fills the form of the Run screen. Must fit the type. */
  default?: ParameterValue;
  /** For a `list`: the fixed options, all different. */
  options?: string[];
  /** Help text, shown behind an (i). */
  help?: string;
}

export const PARAMETER_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_PARAMETER_KEY_LENGTH = 40;

/** The parameters of a definition: an older definition (schemaVersion 1) has none. */
export const parametersOf = (definition: { parameters?: FlowParameter[] }): FlowParameter[] => definition.parameters ?? [];

/**
 * The definition with a new list of parameters, as schemaVersion 2. This is the only place that writes the new version:
 * a definition that gets no parameter stays as it is stored (a published version cannot change), so opening a draft never
 * makes it "unsaved". An empty list on a definition without `parameters` returns it unchanged.
 */
export function withParameters(definition: FlowDefinition, parameters: FlowParameter[]): FlowDefinition {
  if (parameters.length === 0 && definition.parameters === undefined) return definition;
  return { ...definition, schemaVersion: definition.schemaVersion >= 3 ? definition.schemaVersion : 2, parameters };
}

/** Does this value fit the type of the parameter? A `list` value must be one of the options. */
export function fitsParameterType(p: Pick<FlowParameter, 'type' | 'options'>, value: unknown): boolean {
  switch (p.type) {
    case 'date':
      return typeof value === 'string' && isIsoDate(value);
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return typeof value === 'string' && (p.options ?? []).includes(value);
  }
}
