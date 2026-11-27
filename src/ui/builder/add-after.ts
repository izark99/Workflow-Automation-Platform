// Adding a step after the selected one, and dropping a step on an edge (SPEC 15.2 items 1 and 2). Pure functions on the definition.
import { NODE_PORTS } from '../../engine/flow/types';
import type { FlowDefinition, FlowNode, NodeType } from '../../engine/flow/types';
import { addStep, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, connectSteps, nextFreePosition, resolvedEdges } from './graph';

/** The gap between the selected step and a step added after it (the column gap of Auto arrange). */
export const ADD_GAP = 80;

/** The input of a new step that a connection fills: the first required one (`in1` of Append and SQL), or none. */
export function firstRequiredInput(type: NodeType): string | undefined {
  const inputs = NODE_PORTS[type].inputs;
  if (inputs.kind === 'variadic') return 'in1';
  return inputs.handles.find((h) => h.required)?.name;
}

/** How many inputs of a type must be connected before it runs. */
function requiredInputCount(type: NodeType): number {
  const inputs = NODE_PORTS[type].inputs;
  return inputs.kind === 'variadic' ? inputs.min : inputs.handles.filter((h) => h.required).length;
}

/** The first output of a step that no connection leaves yet. A Filter gives `match` first. */
export function freeOutput(def: FlowDefinition, node: FlowNode): string | undefined {
  const used = new Set(resolvedEdges(def).filter((e) => e.source === node.id).map((e) => e.sourceHandle));
  return NODE_PORTS[node.type].outputs.find((h) => !used.has(h));
}

const overlaps = (def: FlowDefinition, x: number, y: number): boolean =>
  def.nodes.some((n) => {
    const p = n.position ?? { x: 0, y: 0 };
    return x < p.x + CARD_WIDTH && p.x < x + CARD_WIDTH && y < p.y + CARD_HEIGHT && p.y < y + CARD_HEIGHT;
  });

export interface AddResult {
  definition: FlowDefinition;
  id: string;
  /** Set when the new step was connected: the step it is connected to. */
  connectedTo?: FlowNode;
}

/**
 * Adds a step. With exactly one step selected that has a free output, the new step goes to its right (the first free place
 * on that row going down) and the selected step is connected to the first required input of the new step, when it has one.
 * With no selection, or several, the step goes below the lowest step and nothing is connected.
 */
export function addStepAfter(def: FlowDefinition, selection: readonly string[], type: NodeType): AddResult {
  const selected = selection.length === 1 ? def.nodes.find((n) => n.id === selection[0]) : undefined;
  const out = selected ? freeOutput(def, selected) : undefined;
  if (!selected || !out) {
    const r = addStep(def, type, nextFreePosition(def));
    return { definition: r.definition, id: r.id };
  }
  const from = selected.position ?? { x: 0, y: 0 };
  const x = from.x + CARD_WIDTH + ADD_GAP;
  let y = from.y;
  while (overlaps(def, x, y)) y += CARD_HEIGHT + CARD_GAP;
  const added = addStep(def, type, { x, y });
  const into = firstRequiredInput(type);
  if (!into) return { definition: added.definition, id: added.id };
  const linked = connectSteps(added.definition, { source: selected.id, sourceHandle: out, target: added.id, targetHandle: into });
  return linked.ok ? { definition: linked.definition, id: added.id, connectedTo: selected } : { definition: added.definition, id: added.id };
}

/**
 * Drops a new step on an edge: source to new step, and new step to target. Returns null (and the caller adds the step
 * without touching the edge) when the new step cannot take the source, cannot give the target, or has a second required input.
 */
export function insertStepOnEdge(def: FlowDefinition, edgeId: string, type: NodeType, position: { x: number; y: number }): { definition: FlowDefinition; id: string } | null {
  const edge = resolvedEdges(def).find((e) => e.id === edgeId);
  const into = firstRequiredInput(type);
  const outOf = NODE_PORTS[type].outputs[0];
  if (!edge || !into || !outOf || requiredInputCount(type) !== 1) return null;
  const withoutEdge: FlowDefinition = { ...def, edges: def.edges.filter((e) => resolvedEdges({ ...def, edges: [e] })[0]?.id !== edgeId) };
  const added = addStep(withoutEdge, type, position);
  const first = connectSteps(added.definition, { source: edge.source, sourceHandle: edge.sourceHandle, target: added.id, targetHandle: into });
  if (!first.ok) return null;
  const second = connectSteps(first.definition, { source: added.id, sourceHandle: outOf, target: edge.target, targetHandle: edge.targetHandle });
  return second.ok ? { definition: second.definition, id: added.id } : null;
}
