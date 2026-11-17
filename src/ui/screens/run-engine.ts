import { parseOutputSettings } from '../../engine/nodes/output';
import { buildOutputFiles } from '../../engine/output/export';
import type { OutputFile } from '../../engine/output/export';
import { runFlow } from '../../engine/run';
import type { FlowDefinition } from '../../engine/flow/types';
import type { TableData } from '../../engine/types';
import { previewRunner } from '../builder/preview-runner';

export interface SheetPreview {
  file: string;
  /** The sheet name, or the file name for a csv file. */
  sheet: string;
  rowCount: number;
  /** The first rows (at most 100). */
  table: TableData;
}

export interface RunOutcome {
  files: OutputFile[];
  sheets: SheetPreview[];
  inputRows: number;
  outputRows: number;
}

export interface RunRequest {
  definition: FlowDefinition;
  effectiveDate: string;
  files: Record<string, File>;
  refTables: Record<string, TableData>;
  signal: AbortSignal;
  /** Called as each step starts: how many have started, how many there are, and the name of this one. */
  onProgress: (started: number, total: number, label: string) => void;
}

/**
 * Runs the whole flow in this browser (DuckDB in a worker), builds the output files and keeps the first rows of each output
 * sheet for the screen. Nothing leaves the browser. The tables of the run are dropped before it returns.
 */
export async function executeRun(req: RunRequest): Promise<RunOutcome> {
  const runner = await previewRunner();
  const labels = new Map(req.definition.nodes.map((n) => [n.id, n.label ?? n.id]));
  const total = req.definition.nodes.length;
  let started = 0;
  const result = await runFlow(runner, {
    flow: req.definition,
    effectiveDate: req.effectiveDate,
    files: Object.fromEntries(Object.entries(req.files).map(([k, f]) => [k, { name: f.name, size: f.size, blob: f }])),
    refTables: req.refTables,
    signal: req.signal,
    onNode: (e) => {
      if (e.status === 'start') req.onProgress(++started, total, labels.get(e.nodeId) ?? e.nodeId);
    },
  });
  try {
    const sheets: SheetPreview[] = [];
    for (const node of req.definition.nodes.filter((n) => n.type === 'output')) {
      const s = parseOutputSettings(node.settings, node.id);
      const table = result.tables.get(`${node.id}/result`);
      sheets.push({ file: s.file, sheet: s.sheet ?? s.file, rowCount: table?.rowCount ?? 0, table: await result.preview(node.id, 'result') });
    }
    const files = await buildOutputFiles(result, req.definition);
    const inputRows = req.definition.nodes.filter((n) => n.type === 'input_file').reduce((n, node) => n + (result.tables.get(`${node.id}/out`)?.rowCount ?? 0), 0);
    return { files, sheets, inputRows, outputRows: sheets.reduce((n, s) => n + s.rowCount, 0) };
  } finally {
    await result.dispose();
  }
}
