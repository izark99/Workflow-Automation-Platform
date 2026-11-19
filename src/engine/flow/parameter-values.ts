import { coded, type ColumnType } from '../types';
import { quoteString } from '../sql';
import { fitsParameterType } from './parameters';
import type { FlowParameter, ParameterType, ParameterValue } from './parameters';

/** The value of one parameter in a run. `null` is a blank optional parameter. */
export interface ResolvedParameter {
  type: ParameterType;
  value: ParameterValue | null;
}

export type ResolvedParameters = Record<string, ResolvedParameter>;

/** The values that the user gave, by parameter key. A missing key and `null` both mean "not given". */
export type ParameterValues = Record<string, ParameterValue | null | undefined>;

/** The column type that a parameter has in formulas and in the `params` table. A list is text. */
export const parameterColumnType = (type: ParameterType): ColumnType => (type === 'list' ? 'text' : type);

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === '';

/**
 * Checks the values against the parameters of the flow: a required value must be given, each value must fit its type, and
 * a list value must be one of the options. Throws an `EngineError` for the first problem, naming the parameter. Runs before
 * any step, so a bad value never gets half a run.
 */
export function resolveParameterValues(parameters: readonly FlowParameter[], values: ParameterValues = {}): ResolvedParameters {
  const out: ResolvedParameters = {};
  for (const p of parameters) {
    const given = values[p.key];
    if (isBlank(given)) {
      if (p.required) throw coded('invalid_settings', 'engine.paramMissing', { key: p.key });
      out[p.key] = { type: p.type, value: null };
      continue;
    }
    if (!fitsParameterType(p, given)) {
      if (p.type === 'list' && typeof given === 'string') {
        throw coded('invalid_settings', 'engine.paramNotOption', { key: p.key, options: (p.options ?? []).join(', ') });
      }
      throw coded('invalid_settings', 'engine.paramWrongType', { key: p.key, type: p.type });
    }
    out[p.key] = { type: p.type, value: given as ParameterValue };
  }
  return out;
}

/** SQL for a value, with its type spelled out. Text is quoted, so a value is never read as SQL. */
export function parameterLiteral(p: ResolvedParameter): string {
  const v = p.value;
  switch (p.type) {
    case 'date':
      return v === null ? 'CAST(NULL AS DATE)' : `CAST(${quoteString(String(v))} AS DATE)`;
    case 'number':
      return v === null ? 'CAST(NULL AS DOUBLE)' : `CAST(${Number(v)} AS DOUBLE)`;
    case 'boolean':
      return v === null ? 'CAST(NULL AS BOOLEAN)' : v ? 'TRUE' : 'FALSE';
    default:
      return v === null ? 'CAST(NULL AS VARCHAR)' : quoteString(String(v));
  }
}

/**
 * Stand-in values for checking a formula in the builder, where no run has values yet: the default of each parameter, or a
 * blank. Only the types matter for the check.
 */
export function placeholderParameters(parameters: readonly FlowParameter[]): ResolvedParameters {
  const out: ResolvedParameters = {};
  for (const p of parameters) {
    if (typeof p.key !== 'string' || p.key === '') continue;
    out[p.key] = { type: p.type, value: p.default !== undefined && fitsParameterType(p, p.default) ? p.default : null };
  }
  return out;
}
