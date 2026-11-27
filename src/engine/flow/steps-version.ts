import { FLOW_SCHEMA_VERSION, NEW_STEP_TYPES } from './types';
import type { FlowDefinition } from './types';

/**
 * The definition as schemaVersion 4 when it holds a step of Phase 8. A definition without one is returned as it is, so that
 * opening a flow never rewrites it and a version is never lowered (a Sort that was deleted again leaves version 4).
 */
export function withStepsVersion(definition: FlowDefinition): FlowDefinition {
  if (definition.schemaVersion === FLOW_SCHEMA_VERSION) return definition;
  if (!definition.nodes.some((n) => (NEW_STEP_TYPES as readonly string[]).includes(n.type))) return definition;
  return { ...definition, schemaVersion: FLOW_SCHEMA_VERSION };
}
