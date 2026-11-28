import type { Cell, ColumnType } from '../../engine/types';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import { translate, formatDate } from '../i18n';
import type { MessageKey } from '../i18n';
import { outputHandlesOf, resolvedEdges, upstreamOf } from './graph';
import type { PreviewTableColumn } from '../components';
import type { PreviewData } from './preview-runner';

export type PreviewTarget =
  | { kind: 'ready'; definition: FlowDefinition; nodeId: string; handle: string; handles: string[] }
  | { kind: 'needs_input'; message: string };

/**
 * What a preview shows for a step and what it has to run. A step with outputs shows its own first output (Filter: match or
 * no match). An Output step shows its `result` table: what it will write, with its sort and its column list applied. An
 * Output step with no input has nothing to show and says so.
 */
export function previewTarget(def: FlowDefinition, step: FlowNode, handle?: string): PreviewTarget {
  const outs = outputHandlesOf(step.type);
  if (outs.length > 0) {
    return { kind: 'ready', definition: upstreamOf(def, [step.id]), nodeId: step.id, handle: handle && outs.includes(handle) ? handle : (outs[0] as string), handles: [...outs] };
  }
  const feed = resolvedEdges(def).find((e) => e.target === step.id);
  if (!feed) {
    return { kind: 'needs_input', message: translate('builder.preview.needsInput') };
  }
  return { kind: 'ready', definition: upstreamOf(def, [step.id]), nodeId: step.id, handle: 'result', handles: ['result'] };
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

/**
 * Find in the popup (SPEC 15.3): the indexes of the rows that have a cell whose text contains the typed text, not case
 * sensitive, in the rows that are loaded. An empty text keeps every row. The cells are the formatted texts that are shown.
 */
export function findRows(rows: readonly (readonly string[])[], query: string): number[] {
  const needle = query.trim().toLowerCase();
  const all = rows.map((_, i) => i);
  if (needle === '') return all;
  return all.filter((i) => rows[i]?.some((cell) => cell.toLowerCase().includes(needle)));
}

/** The columns and the formatted cells of a preview, for `PreviewTable`. The names and cells are the user's data. */
export function previewTableData(data: PreviewData): { columns: PreviewTableColumn[]; rows: string[][] } {
  return {
    columns: data.columns.map((c) => ({ header: c.name, align: c.type === 'number' ? ('right' as const) : ('left' as const) })),
    rows: data.rows.map((cells) => data.columns.map((c, i) => formatCell(cells[i] ?? null, c.type))),
  };
}

/** At most `max` rows of a preview, for the Test tab after the popup loaded more: the first rows, or the last ones for the last part. */
export function capRows(data: PreviewData, max: number): PreviewData {
  if (data.rows.length <= max) return data;
  const drop = data.rows.length - max;
  return data.part === 'last' ? { ...data, rows: data.rows.slice(drop), fromRow: data.fromRow + drop } : { ...data, rows: data.rows.slice(0, max) };
}

const OUTPUT_LABELS: Readonly<Record<string, MessageKey>> = {
  match: 'builder.preview.match',
  nomatch: 'builder.preview.noMatch',
  kept: 'builder.preview.kept',
  removed: 'builder.preview.removed',
  ok: 'builder.preview.ok',
  errors: 'builder.preview.errors',
  added: 'builder.preview.added',
  changed: 'builder.preview.changed',
};

/** The text of the chip of an output on the Test tab: its name in the current language and, once a preview ran, its row count. */
export function outputChipText(handle: string, count: number | undefined): string {
  const key = OUTPUT_LABELS[handle];
  const name = key ? translate(key) : handle;
  return count === undefined ? name : `${name} (${count.toLocaleString('en-US')})`;
}
