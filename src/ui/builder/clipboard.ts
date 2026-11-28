// Copy, paste and duplicate of steps (SPEC 15.2 item 3). Pure functions, plus a clipboard that lives in memory only.
import { withStepsVersion } from '../../engine/flow/steps-version';
import type { FlowDefinition, FlowEdge, FlowNode } from '../../engine/flow/types';
import { compactVariadic, edgeId, nextStepId, resolvedEdges } from './graph';

export const PASTE_OFFSET = 40;

/** Steps and the connections between them. The clipboard holds a deep copy, so later edits of the source do not reach it. */
export interface StepClip {
  schemaVersion: FlowDefinition['schemaVersion'];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const clone = <T>(value: T): T => structuredClone(value);

/** Copies the steps with these ids and the connections that run between two of them. Nothing else. */
export function copySteps(def: FlowDefinition, ids: readonly string[]): StepClip | null {
  const chosen = new Set(ids);
  const nodes = def.nodes.filter((n) => chosen.has(n.id));
  if (nodes.length === 0) return null;
  const edges = resolvedEdges(def).filter((e) => chosen.has(e.source) && chosen.has(e.target));
  return { schemaVersion: def.schemaVersion, nodes: clone(nodes), edges: clone(edges) };
}

/** `Name (copy)`, then `Name (copy 2)`, never a label that another step has. */
function copyLabel(label: string, taken: Set<string>): string {
  const base = label.replace(/ \(copy(?: \d+)?\)$/, '');
  let candidate = `${base} (copy)`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} (copy ${n})`;
  return candidate;
}

/** `Main` becomes `Main 2`, then `Main 3`: a key stands for one test file and one file of a run. */
function uniqueKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  const base = key.replace(/ \d+$/, '');
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface PasteResult {
  definition: FlowDefinition;
  /** Ids of the new steps, in the order of the clip. */
  ids: string[];
}

/**
 * Puts the copies in the flow: new ids, " (copy)" names, a unique Input file key, the settings and their parameter bindings
 * as they were, the copied connections between the new steps, and a shift of `offset` px (the same for all, so the shape stays).
 */
export function pasteSteps(def: FlowDefinition, clip: StepClip, offset: number = PASTE_OFFSET): PasteResult {
  let next: FlowDefinition = { ...def, schemaVersion: Math.max(def.schemaVersion, clip.schemaVersion) as FlowDefinition['schemaVersion'] };
  const labels = new Set(def.nodes.map((n) => n.label ?? n.id));
  const keys = new Set(def.nodes.filter((n) => n.type === 'input_file').map((n) => String(n.settings.key ?? '')));
  const idMap = new Map<string, string>();
  const added: FlowNode[] = [];
  for (const source of clip.nodes) {
    const id = nextStepId({ ...next, nodes: [...next.nodes, ...added] }, source.type);
    idMap.set(source.id, id);
    const label = copyLabel(source.label ?? source.id, labels);
    labels.add(label);
    const settings = clone(source.settings);
    if (source.type === 'input_file') {
      const key = uniqueKey(String(settings.key ?? ''), keys);
      keys.add(key);
      settings.key = key;
    }
    const at = source.position ?? { x: 0, y: 0 };
    added.push({ id, type: source.type, label, position: { x: Math.round(at.x + offset), y: Math.round(at.y + offset) }, settings });
  }
  const edges: FlowEdge[] = clip.edges.flatMap((e) => {
    const from = idMap.get(e.source);
    const to = idMap.get(e.target);
    if (!from || !to) return [];
    const edge: FlowEdge = { source: from, target: to, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}), ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}) };
    return [{ ...edge, id: edgeId(edge) }];
  });
  next = withStepsVersion(compactVariadic({ ...next, nodes: [...next.nodes, ...added], edges: [...next.edges, ...edges] }));
  return { definition: next, ids: added.map((n) => n.id) };
}

// The clipboard of the app: in memory, gone on reload, shared by the flows and versions of the tab, never sent anywhere
// and never written to the system clipboard.
let held: StepClip | null = null;
/** How many times this clip was pasted, so that the next paste moves a further step to the side. */
let pastes = 0;

export const setClip = (clip: StepClip | null): void => {
  held = clip;
  pastes = 0;
};
export const getClip = (): StepClip | null => held;
/** The offset of the next paste: 40 px the first time, 80 px the second, and so on. */
export const nextPasteOffset = (): number => PASTE_OFFSET * (pastes + 1);
export const notePasted = (): void => {
  pastes += 1;
};
