import { bindableSetting } from '../../../engine/flow/bindable';
import type { BindableSetting } from '../../../engine/flow/bindable';
import { isParamBinding } from '../../../engine/flow/bindings';
import type { FlowParameter, ParameterType, ParameterValue } from '../../../engine/flow/parameters';
import { resolveBindings } from '../../../engine/flow/resolve-bindings';
import { resolveParameterValues } from '../../../engine/flow/parameter-values';
import type { ParameterValues } from '../../../engine/flow/parameter-values';
import type { FlowNode } from '../../../engine/flow/types';
import { EngineError } from '../../../engine/types';
import { errorText, formatDate, translate } from '../../i18n';

/** The parameter types that can fill a setting: the same type, a list for a text, and a list or a text for fixed choices. */
const FITS: Record<BindableSetting['type'], readonly ParameterType[]> = {
  text: ['text', 'list'],
  number: ['number'],
  date: ['date'],
  boolean: ['boolean'],
  choice: ['text', 'list'],
};

/** The parameters of the flow that a setting can use, in the order of the flow. */
export const parametersThatFit = (parameters: readonly FlowParameter[], setting: BindableSetting): FlowParameter[] => parameters.filter((p) => FITS[setting.type].includes(p.type));

export type BindingView = { kind: 'fixed' } | { kind: 'bound'; key: string; label: string; param: FlowParameter } | { kind: 'missing'; key: string };

/** What a setting holds: a fixed value, a binding to a parameter of the flow, or a binding to one that was deleted. */
export function bindingView(value: unknown, parameters: readonly FlowParameter[]): BindingView {
  if (!isParamBinding(value)) return { kind: 'fixed' };
  const param = parameters.find((p) => p.key === value.$param);
  return param ? { kind: 'bound', key: param.key, label: param.label, param } : { kind: 'missing', key: value.$param };
}

/** "Now: {value}": the value that the run will use, in the words of the screens. */
export function nowText(type: ParameterType, value: ParameterValue | null): string {
  const shown = value === null ? translate('builder.param.blank') : type === 'boolean' ? translate(value ? 'builder.param.yes' : 'builder.param.no') : type === 'date' ? formatDate(String(value)) : String(value);
  return translate('builder.param.now', { value: shown });
}

export interface StepBindingResult {
  setting: string;
  /** The key of the parameter that the setting is bound to. */
  key: string;
  /** The parameter, or undefined when it was deleted. */
  param: FlowParameter | undefined;
  /** The value that the run will use with the test values, or the reason it cannot be used. */
  outcome: { ok: true; value: ParameterValue | null } | { ok: false; error: string };
}

/**
 * What each bound setting of a step gets from a set of parameter values (the Test tab, SPEC 13.3 item 4): the value, or the
 * error that the run would stop with, in the current language. The value is checked against its parameter first, then against
 * the setting, with the same functions as the run.
 */
export function stepBindingResults(step: FlowNode, parameters: readonly FlowParameter[], values: ParameterValues): StepBindingResult[] {
  const out: StepBindingResult[] = [];
  for (const [setting, value] of Object.entries(step.settings)) {
    if (!isParamBinding(value) || !bindableSetting(step.type, setting)) continue;
    const key = value.$param;
    const param = parameters.find((p) => p.key === key);
    const fail = (e: unknown): StepBindingResult => {
      if (!(e instanceof EngineError)) throw e;
      return { setting, key, param, outcome: { ok: false, error: errorText(e) } };
    };
    try {
      // The step alone, with only this setting, so that each setting reports its own problem.
      const resolved = resolveParameterValues(param ? [param] : [], values);
      const one = { schemaVersion: 3 as const, nodes: [{ ...step, settings: { [setting]: value } }], edges: [] };
      const result = resolveBindings(one, resolved).nodes[0]!.settings;
      out.push({ setting, key, param, outcome: { ok: true, value: setting in result ? (result[setting] as ParameterValue) : null } });
    } catch (e) {
      out.push(fail(e));
    }
  }
  return out;
}
