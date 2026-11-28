import type { FlowDefinition, ParamBinding } from './types';

// A single-value setting of a step can take a parameter instead of a value (SPEC 13.3): `{"$param": "key"}`.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Is the value a binding: an object with one key, `$param`, that holds a text that is not empty? */
export function isParamBinding(value: unknown): value is ParamBinding {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$param' && typeof value.$param === 'string' && value.$param !== '';
}

/** Does the value hold an object with a `$param` key anywhere inside it (a list row, a nested object)? */
export function containsBindingKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBindingKey);
  if (!isRecord(value)) return false;
  return '$param' in value || Object.values(value).some(containsBindingKey);
}

export interface BindingRef {
  nodeId: string;
  setting: string;
  key: string;
}

/** Every binding that sits directly in the settings of a step. */
export function bindingsOf(definition: Pick<FlowDefinition, 'nodes'>): BindingRef[] {
  const out: BindingRef[] = [];
  for (const node of definition.nodes) {
    for (const [setting, value] of Object.entries(node.settings)) if (isParamBinding(value)) out.push({ nodeId: node.id, setting, key: value.$param });
  }
  return out;
}

/**
 * The definition as schemaVersion 3 when it has a binding. A definition without one is returned as it is, so that opening
 * a flow never rewrites it (a published version cannot change) and a version is never lowered.
 */
export function withBindingsVersion(definition: FlowDefinition): FlowDefinition {
  if (definition.schemaVersion >= 3 || bindingsOf(definition).length === 0) return definition;
  return { ...definition, schemaVersion: 3 };
}
