import type { FlowDefinition, FlowNode } from '../../../engine/flow/types';
import type { FileSource } from '../../../engine/input/load';
import type { Column } from '../../../engine/types';
import type { RefTable } from '../../../engine/versions';
import { translate } from '../../i18n';
import { resolvedEdges, upstreamOf } from '../graph';
import { neededFiles } from '../preview-logic';
import { runPreview } from '../preview-runner';

/**
 * The columns (names and types) that arrive at the first input of a step: the steps before it run on the test files, and the columns of
 * the table that feeds the step are read. `inputHandle` picks the input (Lookup has `left` and `right`); by default it is the first connection into the step. Throws a message that says what to do when an input or a test file is missing.
 */
export async function loadSourceColumns(def: FlowDefinition, step: FlowNode, files: Record<string, File>, refTables: RefTable[], effectiveDate: string, inputHandle?: string): Promise<Column[]> {
  const feed = resolvedEdges(def).find((e) => e.target === step.id && (inputHandle === undefined || e.targetHandle === inputHandle));
  if (!feed) throw new Error(translate('builder.form.mapping.loadNeedsInput'));
  const sub = upstreamOf(def, [feed.source]);
  const sources: Record<string, FileSource> = {};
  for (const n of neededFiles(sub)) {
    const f = files[n.key];
    if (!f) throw new Error(translate('builder.form.mapping.loadNeedsFile'));
    sources[n.key] = { name: f.name, size: f.size, blob: f };
  }
  const data = await runPreview({ definition: sub, nodeId: feed.source, handle: feed.sourceHandle, files: sources, refTables, effectiveDate });
  return data.columns;
}
