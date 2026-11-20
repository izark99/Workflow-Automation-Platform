import { bindableSetting } from '../../../engine/flow/bindable';
import { isParamBinding } from '../../../engine/flow/bindings';
import type { NodeType } from '../../../engine/flow/types';

// Pure edits of the settings of a step for the parameter control (SPEC 13.3). A form knows only plain values: the Configure
// tab shows it the step with a placeholder where a setting is bound, and puts the bindings back when the form saves.

type Settings = Record<string, unknown>;

/** The names of the settings that hold a binding. */
export const boundNames = (settings: Settings): string[] => Object.entries(settings).filter(([, v]) => isParamBinding(v)).map(([k]) => k);

/** The settings as a form sees them: every binding replaced by the placeholder of its setting. */
export function hiddenFromForm(type: NodeType, settings: Settings): Settings {
  const names = boundNames(settings);
  if (names.length === 0) return settings;
  const out = { ...settings };
  for (const name of names) {
    const setting = bindableSetting(type, name);
    if (setting) out[name] = setting.placeholder;
    else delete out[name];
  }
  return out;
}

/** What a form saved, with the bindings of the current settings written over it. */
export function putBindingsBack(saved: Settings, current: Settings): Settings {
  const names = boundNames(current);
  if (names.length === 0) return saved;
  const out = { ...saved };
  for (const name of names) out[name] = current[name];
  return out;
}

export const bindSetting = (settings: Settings, name: string, key: string): Settings => ({ ...settings, [name]: { $param: key } });

/** Gives a field back: its last fixed value, or unset when it had none and may be unset, else its placeholder. */
export function unbindSetting(type: NodeType, settings: Settings, name: string, lastFixed: unknown): Settings {
  const out = { ...settings };
  const setting = bindableSetting(type, name);
  if (lastFixed !== undefined) out[name] = lastFixed;
  else if (setting && !setting.optional) out[name] = setting.placeholder;
  else delete out[name];
  return out;
}
