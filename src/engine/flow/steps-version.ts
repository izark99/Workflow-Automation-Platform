import { NEW_STEP_TYPES, PRINT_SCHEMA_VERSION, STEPS_SCHEMA_VERSION } from './types';
import type { FlowDefinition } from './types';

/**
 * The definition as schemaVersion 4 when it holds a step of Phase 8. A definition without one is returned as it is, so that
 * opening a flow never rewrites it and a version is never lowered (a Sort that was deleted again leaves version 4).
 */
export function withStepsVersion(definition: FlowDefinition): FlowDefinition {
  // Version 4 and the versions after it already allow the steps: a version is never lowered.
  if (definition.schemaVersion >= STEPS_SCHEMA_VERSION) return definition;
  if (!definition.nodes.some((n) => (NEW_STEP_TYPES as readonly string[]).includes(n.type))) return definition;
  return { ...definition, schemaVersion: STEPS_SCHEMA_VERSION };
}

/**
 * The definition as schemaVersion 5 when an Output step has a print layout. A definition without one is returned as it is, so that
 * opening a flow never rewrites it, and a version is never lowered (the layout may be turned off again and the version stays 5).
 */
export function withPrintVersion(definition: FlowDefinition): FlowDefinition {
  if (definition.schemaVersion >= PRINT_SCHEMA_VERSION) return definition;
  if (!definition.nodes.some((n) => n.type === 'output' && n.settings.print !== undefined)) return definition;
  return { ...definition, schemaVersion: PRINT_SCHEMA_VERSION };
}
