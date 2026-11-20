import { coded } from '../types';
import { bindableSetting } from './bindable';
import type { BindableSetting } from './bindable';
import { isParamBinding } from './bindings';
import type { ResolvedParameters } from './parameter-values';
import type { ParameterValue } from './parameters';
import type { FlowDefinition, FlowNode } from './types';

// The engine replaces every binding by the value of its parameter before a step is compiled (SPEC 13.3 item 4), so the
// step modules see plain values. The values come from `resolveParameterValues`, which already checked each one against
// its parameter; this checks it against the setting.

const kindOf = (type: string): string => (type === 'list' ? 'text' : type);

/** Why a value cannot fill the setting, as an error that names the step and the setting. */
function checkValue(node: FlowNode, setting: BindableSetting, key: string, paramType: string, value: ParameterValue) {
  const step = node.label ?? node.id;
  const base = { step, setting: setting.name, key };
  const expected = setting.type === 'choice' ? 'text' : setting.type;
  if (kindOf(paramType) !== expected) throw coded('invalid_settings', 'engine.bindType', { ...base, expected, got: paramType }, node.id);
  if (setting.type === 'choice' && !(setting.choices ?? []).includes(String(value))) {
    throw coded('invalid_settings', 'engine.bindChoice', { ...base, value: String(value), choices: [...(setting.choices ?? [])].sort().join(', ') }, node.id);
  }
  if (setting.type === 'number') {
    const n = Number(value);
    if ((setting.integer && !Number.isInteger(n)) || (setting.min !== undefined && n < setting.min)) {
      throw coded('invalid_settings', 'engine.bindNumber', { ...base, value: n, rule: `${setting.integer ? 'a whole number' : 'a number'}${setting.min !== undefined ? ` of ${setting.min} or more` : ''}` }, node.id);
    }
  }
}

/**
 * The definition with every binding replaced by its value. A blank optional parameter removes an optional setting, and is an
 * error for a required one. Throws an `EngineError` for the first problem. The definition that comes in is not changed, and
 * a definition without bindings comes back as the same object.
 */
export function resolveBindings(definition: FlowDefinition, parameters: ResolvedParameters): FlowDefinition {
  let changed = false;
  const nodes = definition.nodes.map((node) => {
    let settings: Record<string, unknown> | undefined;
    for (const [name, value] of Object.entries(node.settings)) {
      if (!isParamBinding(value)) continue;
      const step = node.label ?? node.id;
      const setting = bindableSetting(node.type, name);
      if (!setting) throw coded('invalid_settings', 'engine.bindNotHere', { step, setting: name }, node.id);
      const param = parameters[value.$param];
      if (!param) throw coded('invalid_settings', 'engine.bindUnknown', { step, setting: name, key: value.$param }, node.id);
      settings ??= { ...node.settings };
      if (param.value === null) {
        if (!setting.optional) throw coded('invalid_settings', 'engine.bindBlank', { step, setting: name, key: value.$param }, node.id);
        delete settings[name];
        continue;
      }
      checkValue(node, setting, value.$param, param.type, param.value);
      settings[name] = param.value;
    }
    if (!settings) return node;
    changed = true;
    return { ...node, settings };
  });
  return changed ? { ...definition, nodes } : definition;
}
