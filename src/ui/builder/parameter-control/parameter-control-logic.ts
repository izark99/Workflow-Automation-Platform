import type { BindableSetting } from '../../../engine/flow/bindable';
import { isParamBinding } from '../../../engine/flow/bindings';
import type { FlowParameter, ParameterType, ParameterValue } from '../../../engine/flow/parameters';
import { formatDate, translate } from '../../i18n';

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
