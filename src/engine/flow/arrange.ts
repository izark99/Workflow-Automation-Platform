/**
 * Pure layout, align and distribute functions for the canvas (SPEC 15.1). No React, no DOM.
 * Every function returns new positions and leaves the definition as it is.
 */
import { NODE_PORTS, type FlowDefinition } from './types';

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  id: string;
  width: number;
  height: number;
}

export interface ArrangeOptions {
  /** Width and height of a step card in px. */
  width: number;
  height: number;
  /** Ids of the selected steps. Two or more arrange only those steps. */
  selection?: readonly string[];
}

export const COLUMN_GAP = 80;
export const ROW_GAP = 40;
export const COMPONENT_GAP = 120;

export type Positions = Record<string, Point>;

/** The point of a step in a result. A missing id is a bug of the caller, so it throws. */
export function pointOf(positions: Positions, id: string): Point {
  const p = positions[id];
  if (!p) throw new Error(`No position for step "${id}".`);
  return p;
}

/** Defaults the first output handle when an edge names none. */
function outputIndex(type: FlowDefinition['nodes'][number]['type'] | undefined, handle: string | undefined): number {
  const outputs = (type ? NODE_PORTS[type]?.outputs : undefined) ?? [];
  const i = handle === undefined ? 0 : outputs.indexOf(handle);
  return i < 0 ? 0 : i;
}

export function arrangeLayout(definition: FlowDefinition, options: ArrangeOptions): Positions {
  const selected = options.selection && options.selection.length >= 2 ? new Set(options.selection) : undefined;
  const nodes = definition.nodes.filter((n) => !selected || selected.has(n.id));
  if (nodes.length === 0) return {};
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const edges = definition.edges.filter((e) => index.has(e.source) && index.has(e.target) && e.source !== e.target);

  const incoming = new Map<string, { from: string; weight: number }[]>(nodes.map((n) => [n.id, []]));
  const outgoing = new Map<string, { to: string; weight: number }[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    // A fraction of a row keeps `match` above `nomatch` when two outputs lead to the same layer.
    const weight = outputIndex(typeOf.get(e.source), e.sourceHandle) * 0.01;
    incoming.get(e.target)?.push({ from: e.source, weight });
    outgoing.get(e.source)?.push({ to: e.target, weight });
  }

  // Layers by the longest path (Kahn). Steps left over by a cycle stay in layer 0.
  const layerOf = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const waiting = new Map(nodes.map((n) => [n.id, incoming.get(n.id)?.length ?? 0]));
  const queue = nodes.filter((n) => waiting.get(n.id) === 0).map((n) => n.id);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as string;
    for (const { to } of outgoing.get(id) ?? []) {
      layerOf.set(to, Math.max(layerOf.get(to) ?? 0, (layerOf.get(id) ?? 0) + 1));
      waiting.set(to, (waiting.get(to) ?? 0) - 1);
      if (waiting.get(to) === 0) queue.push(to);
    }
  }

  // Connected components, in the order of their first step.
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    parent.set(id, r);
    return r;
  };
  for (const e of edges) parent.set(find(e.source), find(e.target));
  const components = new Map<string, string[]>();
  for (const n of nodes) {
    const root = find(n.id);
    components.set(root, [...(components.get(root) ?? []), n.id]);
  }

  const result: Positions = {};
  let top = 0;
  for (const ids of components.values()) {
    const layerCount = Math.max(...ids.map((id) => layerOf.get(id) ?? 0)) + 1;
    const layers: string[][] = Array.from({ length: layerCount }, () => []);
    for (const id of ids) layers[layerOf.get(id) ?? 0]?.push(id);

    const rank = new Map<string, number>();
    const renumber = (layer: string[]) => layer.forEach((id, i) => rank.set(id, i));
    layers.forEach(renumber);
    const sweep = (order: number[], neighbours: (id: string) => { id: string; weight: number }[]) => {
      for (const l of order) {
        const keyed = (layers[l] ?? []).map((id, i) => {
          const near = neighbours(id).filter((n) => rank.has(n.id));
          const key = near.length === 0 ? i : near.reduce((sum, n) => sum + (rank.get(n.id) ?? 0) + n.weight, 0) / near.length;
          return { id, key, i };
        });
        keyed.sort((a, b) => a.key - b.key || a.i - b.i);
        layers[l] = keyed.map((k) => k.id);
        renumber(layers[l] ?? []);
      }
    };
    const forward = Array.from({ length: layerCount - 1 }, (_, i) => i + 1);
    const backward = Array.from({ length: layerCount - 1 }, (_, i) => layerCount - 2 - i);
    const fromInputs = (id: string) => (incoming.get(id) ?? []).map((e) => ({ id: e.from, weight: e.weight }));
    const fromOutputs = (id: string) => (outgoing.get(id) ?? []).map((e) => ({ id: e.to, weight: 0 }));
    sweep(forward, fromInputs);
    sweep(backward, fromOutputs);
    sweep(forward, fromInputs);

    const height = (count: number) => count * options.height + Math.max(0, count - 1) * ROW_GAP;
    const tallest = Math.max(...layers.map((l) => height(l.length)));
    layers.forEach((layer, l) => {
      const start = top + (tallest - height(layer.length)) / 2;
      layer.forEach((id, i) => {
        result[id] = { x: l * (options.width + COLUMN_GAP), y: start + i * (options.height + ROW_GAP) };
      });
    });
    top += tallest + COMPONENT_GAP;
  }

  if (selected) {
    const placed = nodes.map((n) => n.position ?? { x: 0, y: 0 });
    const left = Math.min(...placed.map((p) => p.x));
    const upper = Math.min(...placed.map((p) => p.y));
    for (const [id, p] of Object.entries(result)) result[id] = { x: p.x + left, y: p.y + upper };
  }
  return result;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignNodes(rects: readonly Rect[], mode: AlignMode): Positions {
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const upper = Math.min(...rects.map((r) => r.y));
  const lower = Math.max(...rects.map((r) => r.y + r.height));
  const out: Positions = {};
  for (const r of rects) {
    let { x, y } = r;
    if (mode === 'left') x = left;
    else if (mode === 'right') x = right - r.width;
    else if (mode === 'center') x = (left + right) / 2 - r.width / 2;
    else if (mode === 'top') y = upper;
    else if (mode === 'bottom') y = lower - r.height;
    else y = (upper + lower) / 2 - r.height / 2;
    out[r.id] = { x, y };
  }
  return out;
}

/** Equal gaps between the edges of the cards. The two outermost steps stay where they are. */
export function distributeNodes(rects: readonly Rect[], axis: 'horizontal' | 'vertical'): Positions {
  const horizontal = axis === 'horizontal';
  const start = (r: Rect) => (horizontal ? r.x : r.y);
  const size = (r: Rect) => (horizontal ? r.width : r.height);
  const sorted = [...rects].sort((a, b) => start(a) - start(b));
  const out: Positions = {};
  for (const r of rects) out[r.id] = { x: r.x, y: r.y };
  if (sorted.length < 3) return out;
  const first = sorted[0] as Rect;
  const last = sorted[sorted.length - 1] as Rect;
  const span = start(last) + size(last) - start(first);
  const gap = (span - sorted.reduce((sum, r) => sum + size(r), 0)) / (sorted.length - 1);
  let cursor = start(first);
  for (const r of sorted) {
    out[r.id] = horizontal ? { x: cursor, y: r.y } : { x: r.x, y: cursor };
    cursor += size(r) + gap;
  }
  return out;
}
