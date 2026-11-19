import { validateFlow } from '../../engine/flow/validate';
import type { FlowParameter, ParameterType } from '../../engine/flow/parameters';
import { translate } from '../i18n';
import type { MessageKey } from '../i18n';

/** The first free key `parameter_1`, `parameter_2`, ... (keys are compared without regard to case). */
export function freeKey(list: readonly FlowParameter[]): string {
  const used = new Set(list.map((p) => p.key.toLowerCase()));
  let n = list.length + 1;
  while (used.has(`parameter_${n}`)) n++;
  return `parameter_${n}`;
}

/** A new text parameter at the end of the list. It is required and has no default. */
export function addParameter(list: readonly FlowParameter[]): FlowParameter[] {
  const key = freeKey(list);
  return [...list, { key, label: translate('builder.params.newLabel', { n: list.length + 1 }), type: 'text', required: true }];
}

export function updateParameter(list: readonly FlowParameter[], index: number, patch: Partial<FlowParameter>): FlowParameter[] {
  return list.map((p, i) => {
    if (i !== index) return p;
    const next = { ...p, ...patch };
    // An empty default or help is left out, so the stored definition has no empty values.
    if (next.default === undefined) delete next.default;
    if (next.help === undefined || next.help === '') delete next.help;
    return next;
  });
}

/** Another type: a default of the old type is dropped, and a list starts with no options. */
export function changeType(list: readonly FlowParameter[], index: number, type: ParameterType): FlowParameter[] {
  const old = list[index];
  if (!old || old.type === type) return [...list];
  const next = list.map((p, i) => (i === index ? { ...p, type } : p));
  const p = { ...next[index]! };
  delete p.default;
  if (type === 'list') p.options = p.options ?? [];
  else delete p.options;
  next[index] = p;
  return next;
}

/** Moves the parameter one place up (-1) or down (1). At the edge the list stays as it is. */
export function moveParameter(list: readonly FlowParameter[], index: number, delta: -1 | 1): FlowParameter[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

export const removeParameter = (list: readonly FlowParameter[], index: number): FlowParameter[] => list.filter((_, i) => i !== index);

/** The options of a list as the lines of a text box, and back. Blank lines are dropped; the engine refuses repeats. */
export const optionsToText = (options: readonly string[] | undefined): string => (options ?? []).join('\n');
export const optionsFromText = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter((l) => l !== '');

/** What is wrong with the parameters, in the language of the user. The same rules as the engine, so nothing is checked twice. */
export function parameterProblems(list: readonly FlowParameter[]): string[] {
  const r = validateFlow({ schemaVersion: 2, nodes: [], edges: [], parameters: list });
  if (r.ok) return [];
  return r.errors
    .filter((e) => e.code === 'invalid_parameters')
    .map((e) => (e.messageId ? translate(e.messageId as MessageKey, e.params) : e.message));
}
