// Pure operations on the flow definition. The canvas reads and writes the same JSON that the engine runs (one format).
import { BASE_SCHEMA_VERSION, NODE_PORTS, NODE_TYPES, VARIADIC_HANDLE } from '../../engine/flow/types';
import { translate } from '../i18n';
import type { MessageKey } from '../i18n';
import type { FlowDefinition, FlowEdge, FlowNode, NodeType } from '../../engine/flow/types';

export interface StepInfo {
  label: string;
  hint: string;
}

/** Name and one-line description of every step type. The texts come from the catalog, read when they are used. */
export const STEP_CATALOG = Object.fromEntries(
  NODE_TYPES.map((type) => [
    type,
    {
      get label(): string {
        return translate(`builder.step.${type}.label`);
      },
      get hint(): string {
        return translate(`builder.step.${type}.hint`);
      },
    },
  ]),
) as Record<NodeType, StepInfo>;

/** The groups of the step list, in the order of the design. */
export const STEP_GROUPS: { label: string; types: NodeType[] }[] = [
  { id: 'files', types: ['input_file', 'reference_table', 'output'] },
  { id: 'shape', types: ['column_mapping', 'filter', 'formula_column', 'unpivot', 'pivot', 'group_by'] },
  { id: 'combine', types: ['lookup_join', 'append'] },
  { id: 'advanced', types: ['sql'] },
].map((g) => ({
  types: g.types as NodeType[],
  get label(): string {
    return translate(`builder.stepGroup.${g.id}` as MessageKey);
  },
}));

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 56;
export const CARD_GAP = 40;

export const emptyDefinition = (): FlowDefinition => ({ schemaVersion: BASE_SCHEMA_VERSION, nodes: [], edges: [] });

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

/** Settings that a new step starts with, so that it is valid from the first moment. The forms of T2.11 to T2.14 change them. */
export function defaultSettings(type: NodeType, id: string): Record<string, unknown> {
  switch (type) {
    case 'input_file':
      // The key is the name that the run screen shows for the file of this step.
      return { key: id, headerRow: 1 };
    case 'column_mapping':
      return { columns: [] };
    case 'formula_column':
      return { name: 'New column', expression: '' };
    case 'lookup_join':
      return { source: { kind: 'node' }, keys: [], bring: [], onNoMatch: 'blank' };
    case 'group_by':
      return { groupBy: [], aggregations: [] };
    case 'append':
      return { match: 'name' };
    case 'sql':
      return { sql: '' };
    case 'output':
      // One sheet name per Output step: Sheet1, Sheet2, ... from the number in the step id.
      return { file: 'Result', format: 'xlsx', sheet: `Sheet${/(\d+)$/.exec(id)?.[1] ?? '1'}` };
    case 'unpivot':
      return { keep: [], unpivot: [], nameColumn: 'name', valueColumn: 'value' };
    case 'pivot':
      return { rowKeys: [], aggregation: 'sum', columns: { from: 'data' } };
    default:
      return {};
  }
}

export function addStep(def: FlowDefinition, type: NodeType, position: { x: number; y: number }): { definition: FlowDefinition; id: string } {
  const id = nextStepId(def, type);
  const step: FlowNode = { id, type, label: nextLabel(def, type), position: { x: Math.round(position.x), y: Math.round(position.y) }, settings: defaultSettings(type, id) };
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
  if (!src || !tgt) return { ok: false, reason: translate('builder.connect.gone') };
  if (src.id === tgt.id) return { ok: false, reason: translate('builder.connect.self') };
  const out = c.sourceHandle ?? outputHandlesOf(src.type)[0];
  if (!out || !outputHandlesOf(src.type).includes(out)) return { ok: false, reason: translate('builder.connect.noOutput', { name: src.label ?? src.id }) };
  const inHandles = inputHandlesOf(def, tgt);
  const into = c.targetHandle ?? inHandles[0];
  if (!into || !inHandles.includes(into)) return { ok: false, reason: translate('builder.connect.noInput', { name: tgt.label ?? tgt.id }) };
  if (resolvedEdges(def).some((e) => e.target === tgt.id && e.targetHandle === into)) {
    return { ok: false, reason: translate('builder.connect.taken', { name: tgt.label ?? tgt.id }) };
  }
  if (reaches(def, tgt.id, src.id)) return { ok: false, reason: translate('builder.connect.loop', { from: src.label ?? src.id, to: tgt.label ?? tgt.id }) };
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

const handleTitle = (handle: string): string | undefined => {
  const keys: Record<string, MessageKey> = { in: 'builder.port.input', left: 'builder.port.left', right: 'builder.port.right', match: 'builder.port.match', nomatch: 'builder.port.noMatch' };
  return keys[handle] ? translate(keys[handle]!) : undefined;
};

/** The name of an input port for a person: `Input`, `Left input`, `Input 2`. */
export const inputTitle = (handle: string): string => handleTitle(handle) ?? (/^in(\d+)$/.test(handle) ? translate('builder.port.numbered', { n: handle.slice(2) }) : handle);

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
  const options: SourceOption[] = [{ value: '', label: translate('builder.sourceNone') }];
  for (const n of def.nodes) {
    if (n.id === targetId || reaches(def, targetId, n.id)) continue;
    const outs = outputHandlesOf(n.type);
    for (const h of outs) options.push({ value: `${n.id}:${h}`, label: translate('builder.stepTitle', { number: numbers.get(n.id) ?? '', name: `${n.label ?? n.id}${outs.length > 1 ? ` (${handleTitle(h) ?? h})` : ''}` }) });
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

/** The steps in `ids` and every step before them, with the connections between those steps: the part of the flow that a preview runs. */
export function upstreamOf(def: FlowDefinition, ids: string[]): FlowDefinition {
  const edges = resolvedEdges(def);
  const keep = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (keep.has(id)) continue;
    keep.add(id);
    for (const e of edges) if (e.target === id) stack.push(e.source);
  }
  return { ...def, nodes: def.nodes.filter((n) => keep.has(n.id)), edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** Replaces the settings of one step. The settings are what the node module of the step type reads. */
export function updateSettings(def: FlowDefinition, id: string, settings: Record<string, unknown>): FlowDefinition {
  return { ...def, nodes: def.nodes.map((n) => (n.id === id ? { ...n, settings } : n)) };
}
