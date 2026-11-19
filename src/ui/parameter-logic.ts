import { resolveParameterValues } from '../engine/flow/parameter-values';
import type { ParameterValues } from '../engine/flow/parameter-values';
import type { FlowParameter, ParameterValue } from '../engine/flow/parameters';
import { errorText } from './i18n';

/** The values that fill a form: the value the user gave, or else the default of the definition. Nothing is remembered between runs. */
export function initialValues(parameters: readonly FlowParameter[], given: ParameterValues = {}): Record<string, ParameterValue | undefined> {
  const out: Record<string, ParameterValue | undefined> = {};
  for (const p of parameters) {
    const v = given[p.key];
    out[p.key] = v === undefined || v === null ? p.default : v;
  }
  return out;
}

/** The error of each parameter whose value is not valid, in the language of the user. A valid parameter has no entry. */
export function parameterValueErrors(parameters: readonly FlowParameter[], values: ParameterValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const p of parameters) {
    try {
      resolveParameterValues([p], values);
    } catch (e) {
      errors[p.key] = errorText(e);
    }
  }
  return errors;
}
