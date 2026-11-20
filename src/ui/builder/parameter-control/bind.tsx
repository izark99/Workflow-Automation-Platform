import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { bindableSetting } from '../../../engine/flow/bindable';
import type { FlowParameter } from '../../../engine/flow/parameters';
import type { FlowNode } from '../../../engine/flow/types';
import { bindSetting, unbindSetting } from './bindings-edit';
import { ParameterControl } from './parameter-control';

/** What a form needs to offer the parameter control for the settings of its step. Given by the Configure tab. */
export interface BindingScope {
  /** The step with its real settings (the form itself is shown the placeholders instead of the bindings). */
  step: FlowNode;
  parameters: readonly FlowParameter[];
  readOnly: boolean;
  /** Saves the complete settings of the step. */
  apply: (settings: Record<string, unknown>) => void;
  /** Remembers the fixed value a setting had before it was bound, by `{step id}.{setting}`, so that "Use a fixed value" gives it back. */
  remember: (memory: string, value: unknown) => void;
  recall: (memory: string) => unknown;
}

const Scope = createContext<BindingScope | null>(null);
export const BindingScopeProvider = Scope.Provider;

/**
 * Puts the parameter control around the input of one setting. Outside the Configure tab, or for a setting that cannot take a
 * parameter, it shows the input as it is. `label` is the name of the field, for the button "Use a parameter for {field}".
 */
export function Bind({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  const scope = useContext(Scope);
  const setting = scope ? bindableSetting(scope.step.type, name) : undefined;
  if (!scope || !setting) return <>{children}</>;
  const { step } = scope;
  const memory = `${step.id}.${name}`;
  return (
    <ParameterControl
      field={label}
      setting={setting}
      parameters={scope.parameters}
      value={step.settings[name]}
      readOnly={scope.readOnly}
      onBind={(key) => {
        scope.remember(memory, step.settings[name]);
        scope.apply(bindSetting(step.settings, name, key));
      }}
      onUnbind={() => scope.apply(unbindSetting(step.type, step.settings, name, scope.recall(memory)))}
    >
      {children}
    </ParameterControl>
  );
}
