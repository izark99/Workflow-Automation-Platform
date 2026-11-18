import { EngineError } from '../types';
import { compileFormula, type CompileEnv } from './compile';
import type { Compiled, FunctionRegistry } from './functions';
import { FormulaError } from './parse';

/**
 * Compiles the formula of a step. A mistake in the formula becomes an `EngineError` that names the step and the
 * character, so the settings panel can show it next to the editor.
 */
export function compileStepFormula(
  source: unknown,
  env: CompileEnv,
  step: { id: string; label: string; setting: string },
  registry?: FunctionRegistry,
): Compiled {
  if (typeof source !== 'string') {
    throw new EngineError(
      'invalid_settings',
      `${step.label} step "${step.id}": "${step.setting}" must be a formula written as text. Type a formula in the step settings.`,
      step.id,
    );
  }
  try {
    return compileFormula(source, env, registry);
  } catch (e) {
    if (e instanceof FormulaError) {
      throw new EngineError(
        'invalid_formula',
        `${step.label} step "${step.id}", ${step.setting} (character ${e.position + 1}): ${e.message}`,
        step.id,
      );
    }
    throw e;
  }
}
