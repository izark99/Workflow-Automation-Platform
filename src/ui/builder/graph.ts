// Pure operations on the flow definition. The canvas reads and writes the same JSON that the engine runs (one format).
import { FLOW_SCHEMA_VERSION, NODE_PORTS, VARIADIC_HANDLE } from '../../engine/flow/types';
import type { FlowDefinition, FlowEdge, FlowNode, NodeType } from '../../engine/flow/types';

export interface StepInfo {
  label: string;
  hint: string;
}

export const STEP_CATALOG: Record<NodeType, StepInfo> = {
  input_file: { label: 'Input file', hint: 'Loads one sheet of an xlsx file, or a csv file.' },
  output: { label: 'Output', hint: 'Writes the result to a sheet or a csv file.' },
  column_mapping: { label: 'Column mapping', hint: 'Selects, renames and types columns.' },
  filter: { label: 'Filter', hint: 'Keeps the rows that match a condition.' },
  formula_column: { label: 'Formula column', hint: 'Adds or replaces a column from a formula.' },
  unpivot: { label: 'Unpivot', hint: 'Turns many columns into rows.' },
  pivot: { label: 'Pivot', hint: 'Turns row values into columns.' },
  group_by: { label: 'Group by', hint: 'Aggregates rows.' },
  lookup_join: { label: 'Lookup / Join', hint: 'Adds columns from a reference table or another step.' },
  append: { label: 'Append', hint: 'Stacks two or more inputs.' },
  sql: { label: 'SQL', hint: 'Runs free SQL on the steps before it.' },
};

/** The groups of the step list, in the order of the design. */
export const STEP_GROUPS: { label: string; types: NodeType[] }[] = [
  { label: 'Files', types: ['input_file', 'output'] },
  { label: 'Shape', types: ['column_mapping', 'filter', 'formula_column', 'unpivot', 'pivot', 'group_by'] },
  { label: 'Combine', types: ['lookup_join', 'append'] },
  { label: 'Advanced', types: ['sql'] },
];

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 56;
export const CARD_GAP = 40;

export const emptyDefinition = (): FlowDefinition => ({ schemaVersion: FLOW_SCHEMA_VERSION, nodes: [], edges: [] });

export const edgeId = (e: FlowEdge): string => e.id ?? `${e.source}:${e.sourceHandle ?? ''}->${e.target}:${e.targetHandle ?? ''}`;

const find = (def: FlowDefinition, id: string): FlowNode | undefined => def.nodes.find((n) => n.id === id);

/** Output handles of a step type. */
export const outputHandlesOf = (type: NodeType): readonly string[] => NODE_PORTS[type].outputs;

/** Edges with both handles filled in. */
export type ResolvedEdge = Omit<FlowEdge, 'id' | 'sourceHandle' | 'targetHandle'> & { id: string; sourceHandle: string; targetHandle: string };

export function resolvedEdges(def: FlowDefinition): ResolvedEdge[] {
  return def.edges.map((e) => {
    const src = find(def, e.source);
    const tgt = find(def, e.target);
    const inputs = tgt ? NODE_PORTS[tgt.type].inputs : undefined;
    const firstIn = inputs?.kind === 'fixed' ? inputs.handles[0]?.name : 'in1';
    return { ...e, id: edgeId(e), sourceHandle: e.sourceHandle ?? (src ? NODE_PORTS[src.type].outputs[0] : undefined) ?? 'out', targetHandle: e.targetHandle ?? firstIn ?? 'in' };
  });
}

/**
 * The input handles a step shows. Fixed types show their handles. Append and SQL show in1..inN with one free handle
 * after the connected ones (at least their minimum), so a new input can always be dropped.
 */
export function inputHandlesOf(def: FlowDefinition, node: FlowNode): string[] {
  const inputs = NODE_PORTS[node.type].inputs;
  if (inputs.kind === 'fixed') return inputs.handles.map((h) => h.name);
  const used = resolvedEdges(def).filter((e) => e.target === node.id).map((e) => Number(VARIADIC_HANDLE.exec(e.targetHandle)?.[1] ?? 0));
  const count = Math.max(inputs.min, Math.max(0, ...used) + 1);
  return Array.from({ length: count }, (_, i) => `in${i + 1}`);
}

/** Step numbers (1-based) in dependency order; steps in a cycle keep their list order after the others. */
export function stepNumbers(def: FlowDefinition): Map<string, number> {
  const edges = resolvedEdges(def);
  const waiting = new Map(def.nodes.map((n) => [n.id, edges.filter((e) => e.target === n.id).length]));
  const order: string[] = [];
  const ready = def.nodes.filter((n) => waiting.get(n.id) === 0).map((n) => n.id);
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const e of edges.filter((x) => x.source === id)) {
      const left = (waiting.get(e.target) ?? 1) - 1;
      waiting.set(e.target, left);
      if (left === 0) ready.push(e.target);
    }
  }
  for (const n of def.nodes) if (!order.includes(n.id)) order.push(n.id);
  return new Map(order.map((id, i) => [id, i + 1]));
}

/** Where a new step goes when it is not dropped: below the lowest step, in the same column. */
export function nextFreePosition(def: FlowDefinition): { x: number; y: number } {
  if (def.nodes.length === 0) return { x: 0, y: 0 };
  const lowest = def.nodes.reduce((a, n) => ((n.position?.y ?? 0) >= (a.position?.y ?? 0) ? n : a), def.nodes[0] as FlowNode);
  return { x: lowest.position?.x ?? 0, y: (lowest.position?.y ?? 0) + CARD_HEIGHT + CARD_GAP };
}

export function nextStepId(def: FlowDefinition, type: NodeType): string {
  let n = def.nodes.filter((s) => s.type === type).length + 1;
  while (find(def, `${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

/** A name for a new step: the type's name, with a number when the name is taken. */
function nextLabel(def: FlowDefinition, type: NodeType): string {
  const base = STEP_CATALOG[type].label;
  const taken = new Set(def.nodes.map((n) => n.label));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function addStep(def: FlowDefinition, type: NodeType, position: { x: number; y: number }): { definition: FlowDefinition; id: string } {
  const id = nextStepId(def, type);
  const step: FlowNode = { id, type, label: nextLabel(def, type), position: { x: Math.round(position.x), y: Math.round(position.y) }, settings: {} };
  return { definition: { ...def, nodes: [...def.nodes, step] }, id };
}

export function moveStep(def: FlowDefinition, id: string, position: { x: number; y: number }): FlowDefinition {
  return { ...def, nodes: def.nodes.map((n) => (n.id === id ? { ...n, position: { x: Math.round(position.x), y: Math.round(position.y) } } : n)) };
}

export interface ConnectionLike {
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}

export type ConnectResult = { ok: true; definition: FlowDefinition } | { ok: false; reason: string };

/** True when `from` reaches `to` along the edges. */
function reaches(def: FlowDefinition, from: string, to: string): boolean {
  const edges = resolvedEdges(def);
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Adds a connection, or says why it is not allowed. Every reason says what to do next. */
export function connectSteps(def: FlowDefinition, c: ConnectionLike): ConnectResult {
  const src = find(def, c.source);
  const tgt = find(def, c.target);
  if (!src || !tgt) return { ok: false, reason: 'One of the steps does not exist any more. Reload the flow and try again.' };
  if (src.id === tgt.id) return { ok: false, reason: 'A step cannot feed itself. Connect it to another step.' };
  const out = c.sourceHandle ?? outputHandlesOf(src.type)[0];
  if (!out || !outputHandlesOf(src.type).includes(out)) return { ok: false, reason: `${src.label ?? src.id} has no output to connect from. Start the connection at a step that has an output.` };
  const inHandles = inputHandlesOf(def, tgt);
  const into = c.targetHandle ?? inHandles[0];
  if (!into || !inHandles.includes(into)) return { ok: false, reason: `${tgt.label ?? tgt.id} takes no input here. Connect to a step that has an input.` };
  if (resolvedEdges(def).some((e) => e.target === tgt.id && e.targetHandle === into)) {
    return { ok: false, reason: `${tgt.label ?? tgt.id} already has an input on that port. Delete the existing connection first, or use another port.` };
  }
  if (reaches(def, tgt.id, src.id)) return { ok: false, reason: `Connecting ${src.label ?? src.id} to ${tgt.label ?? tgt.id} would make a loop. A flow runs from top to bottom without loops.` };
  const edge: FlowEdge = { source: src.id, sourceHandle: out, target: tgt.id, targetHandle: into };
  return { ok: true, definition: { ...def, edges: [...def.edges, { ...edge, id: edgeId(edge) }] } };
}

/** Removes the steps and the connections that touch them; the inputs of Append and SQL are renumbered without a gap. */
export function deleteSteps(def: FlowDefinition, ids: string[]): FlowDefinition {
  const gone = new Set(ids);
  const kept = def.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
  return compactVariadic({ ...def, nodes: def.nodes.filter((n) => !gone.has(n.id)), edges: kept });
}

export function deleteEdges(def: FlowDefinition, ids: string[]): FlowDefinition {
  const gone = new Set(ids);
  return compactVariadic({ ...def, edges: resolvedEdges(def).filter((e) => !gone.has(e.id)) });
}

function compactVariadic(def: FlowDefinition): FlowDefinition {
  const edges = resolvedEdges(def);
  const out = edges.map((e) => ({ ...e }));
  for (const node of def.nodes) {
    if (NODE_PORTS[node.type].inputs.kind !== 'variadic') continue;
    const into = out.filter((e) => e.target === node.id).sort((a, b) => Number(a.targetHandle.slice(2)) - Number(b.targetHandle.slice(2)));
    into.forEach((e, i) => {
      e.targetHandle = `in${i + 1}`;
      e.id = edgeId({ ...e });
    });
  }
  return { ...def, edges: out };
}

export function renameStep(def: FlowDefinition, id: string, label: string): FlowDefinition {
  return { ...def, nodes: def.nodes.map((n) => (n.id === id ? { ...n, label } : n)) };
}

export interface SourceOption {
  /** `stepId:handle`, or an empty text for no input. */
  value: string;
  label: string;
}

const HANDLE_TITLES: Record<string, string> = { in: 'Input', left: 'Left input', right: 'Right input', match: 'match', nomatch: 'no match' };

/** The name of an input port for a person: `Input`, `Left input`, `Input 2`. */
export const inputTitle = (handle: string): string => HANDLE_TITLES[handle] ?? (/^in(\d+)$/.test(handle) ? `Input ${handle.slice(2)}` : handle);

/** The value of the connection into an input port, or an empty text. */
export function currentSource(def: FlowDefinition, targetId: string, handle: string): string {
  const e = resolvedEdges(def).find((x) => x.target === targetId && x.targetHandle === handle);
  return e ? `${e.source}:${e.sourceHandle}` : '';
}

/**
 * The steps that an input port can read from: every other step that has an output and is not downstream of this step
 * (that would be a loop). A step with two outputs, like Filter, is offered once per output.
 */
export function sourceOptions(def: FlowDefinition, targetId: string): SourceOption[] {
  const numbers = stepNumbers(def);
  const options: SourceOption[] = [{ value: '', label: 'None' }];
  for (const n of def.nodes) {
    if (n.id === targetId || reaches(def, targetId, n.id)) continue;
    const outs = outputHandlesOf(n.type);
    for (const h of outs) options.push({ value: `${n.id}:${h}`, label: `${numbers.get(n.id)}. ${n.label ?? n.id}${outs.length > 1 ? ` (${HANDLE_TITLES[h] ?? h})` : ''}` });
  }
  return options;
}

/** Sets or clears what feeds one input port. Replacing keeps the port, so Append and SQL are not renumbered. */
export function setInput(def: FlowDefinition, targetId: string, handle: string, value: string): ConnectResult {
  if (value === '') {
    const existing = resolvedEdges(def).find((e) => e.target === targetId && e.targetHandle === handle);
    return { ok: true, definition: existing ? deleteEdges(def, [existing.id]) : def };
  }
  const sep = value.lastIndexOf(':');
  const source = value.slice(0, sep);
  const sourceHandle = value.slice(sep + 1);
  const without: FlowDefinition = { ...def, edges: resolvedEdges(def).filter((e) => !(e.target === targetId && e.targetHandle === handle)) };
  return connectSteps(without, { source, sourceHandle, target: targetId, targetHandle: handle });
}
