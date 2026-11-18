import { runFlow } from '../../engine/run';
import { createBrowserRunner } from '../../engine/runner/browser-runner';
import type { FileSource } from '../../engine/input/load';
import type { FlowDefinition } from '../../engine/flow/types';
import { EngineError } from '../../engine/types';
import type { Cell, Column, SqlRunner } from '../../engine/types';
import { prepareRun } from '../../engine/versions';
import type { RefTable } from '../../engine/versions';

export interface PreviewData {
  columns: Column[];
  rows: Cell[][];
  /** Rows in the whole table; the preview holds at most 100. */
  totalRows: number;
}

let shared: Promise<SqlRunner> | null = null;

/** One DuckDB worker for all previews of the page. It starts at the first preview. */
export function previewRunner(): Promise<SqlRunner> {
  shared ??= createBrowserRunner().catch((e: unknown) => {
    shared = null;
    throw new EngineError('node_failed', `The preview engine could not start: ${e instanceof Error ? e.message : String(e)}. Reload the page and try again.`);
  });
  return shared;
}

export interface PreviewRequest {
  /** The steps to run: the target step and everything before it. */
  definition: FlowDefinition;
  nodeId: string;
  handle: string;
  /** Test files by input key. They stay in the browser. */
  files: Record<string, FileSource>;
  refTables: RefTable[];
  effectiveDate: string;
  signal?: AbortSignal;
  /** Tests pass a Node runner here. */
  runner?: SqlRunner;
}

/** Runs the sub-flow in the browser and returns the first 100 rows of one table. Reference tables are the versions valid on the date. */
export async function runPreview(req: PreviewRequest): Promise<PreviewData> {
  const runner = req.runner ?? (await previewRunner());
  const prepared = prepareRun({
    flowName: 'preview',
    flowVersions: [{ versionNo: 1, validFrom: '1900-01-01', validTo: null, definition: req.definition }],
    refTables: req.refTables,
    effectiveDate: req.effectiveDate,
  });
  const result = await runFlow(runner, { flow: req.definition, effectiveDate: req.effectiveDate, files: req.files, refTables: prepared.refTables, signal: req.signal });
  try {
    const table = result.tables.get(`${req.nodeId}/${req.handle}`);
    const data = await result.preview(req.nodeId, req.handle);
    return { columns: data.columns, rows: data.rows, totalRows: table?.rowCount ?? data.rows.length };
  } finally {
    await result.dispose();
  }
}
