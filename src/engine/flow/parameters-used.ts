import type { FlowDefinition } from './types';
import { parametersOf } from './parameters';
import type { FlowParameter } from './parameters';

const PARAM_CALL = /\bPARAM\s*\(\s*"([^"]*)"/gi;

/** Every text in a value, however deep. */
function* texts(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* texts(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* texts(v);
}

/**
 * The parameters that the steps of a definition read: those named in a `PARAM("key")` of any setting, and all of them when
 * a SQL step reads `params`. Used by the Test tab, which runs only the steps before the selected one and so asks only for the
 * values that these steps need. In the order of the parameter list.
 */
export function parametersUsedBy(definition: FlowDefinition): FlowParameter[] {
  const all = parametersOf(definition);
  if (all.length === 0) return [];
  const wanted = new Set<string>();
  let everything = false;
  for (const node of definition.nodes) {
    for (const text of texts(node.settings)) {
      for (const m of text.matchAll(PARAM_CALL)) wanted.add((m[1] ?? '').toLowerCase());
    }
    if (node.type === 'sql' && typeof node.settings.sql === 'string' && /\bparams\b/i.test(node.settings.sql)) everything = true;
  }
  return all.filter((p) => everything || wanted.has(p.key.toLowerCase()));
}

/** The definition with only the parameters that its steps read, so a run asks for nothing else. */
export function withUsedParametersOnly(definition: FlowDefinition): FlowDefinition {
  if (parametersOf(definition).length === 0) return definition;
  return { ...definition, parameters: parametersUsedBy(definition) };
}
