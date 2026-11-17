import { formatDate } from '../../engine/versions';
import type { Cell, ColumnType } from '../../engine/types';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import { outputHandlesOf, resolvedEdges, upstreamOf } from './graph';

export type PreviewTarget =
  | { kind: 'ready'; definition: FlowDefinition; nodeId: string; handle: string; handles: string[] }
  | { kind: 'needs_input'; message: string };

/**
 * What a preview shows for a step and what it has to run. A step with outputs shows its own first output (Filter: match or
 * no match). An Output step has no output table, so it shows what it will write: the table of the step that feeds it.
 */
export function previewTarget(def: FlowDefinition, step: FlowNode, handle?: string): PreviewTarget {
  const outs = outputHandlesOf(step.type);
  if (outs.length > 0) {
    return { kind: 'ready', definition: upstreamOf(def, [step.id]), nodeId: step.id, handle: handle && outs.includes(handle) ? handle : (outs[0] as string), handles: [...outs] };
  }
  const feed = resolvedEdges(def).find((e) => e.target === step.id);
  if (!feed) {
    return { kind: 'needs_input', message: 'This step has no input yet. Choose the step it reads from on the Setup tab, then preview again.' };
  }
  return { kind: 'ready', definition: upstreamOf(def, [feed.source]), nodeId: feed.source, handle: feed.sourceHandle, handles: [feed.sourceHandle] };
}

export interface NeededFile {
  stepId: string;
  label: string;
  /** The logical key of the Input file step. Test files are held under it. */
  key: string;
}

/** The Input file steps of a (sub)flow, which need a test file before the preview can run. */
export function neededFiles(def: FlowDefinition): NeededFile[] {
  return def.nodes
    .filter((n) => n.type === 'input_file')
    .map((n) => ({ stepId: n.id, label: n.label ?? n.id, key: typeof n.settings.key === 'string' ? n.settings.key : '' }));
}

/** A cell as the preview table shows it: dates as `30 Sep 2026`, no text for a blank, booleans as words. */
export function formatCell(value: Cell, type: ColumnType): string {
  if (value === null) return '';
  if (type === 'date' && typeof value === 'string') return formatDate(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** The same sub-flow with the same settings gives the same key; the preview is stale when the key changes. */
export const previewKey = (def: FlowDefinition, nodeId: string, handle: string, date: string): string => JSON.stringify([def, nodeId, handle, date]);
