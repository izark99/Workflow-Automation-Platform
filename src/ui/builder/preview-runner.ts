import { warningText } from '../i18n';
import { PREVIEW_ROWS, runFlow } from '../../engine/run';
import { createBrowserRunner } from '../../engine/runner/browser-runner';
import type { FileSource } from '../../engine/input/load';
import type { FlowDefinition } from '../../engine/flow/types';
import type { ParameterValues } from '../../engine/flow/parameter-values';
import { parametersOf } from '../../engine/flow/parameters';
import { withUsedParametersOnly } from '../../engine/flow/parameters-used';
import { initialValues } from '../parameter-logic';
import { EngineError } from '../../engine/types';
import type { Cell, Column, SqlRunner } from '../../engine/types';
import { prepareRun } from '../../engine/versions';
import type { RefTable } from '../../engine/versions';

export type PreviewPart = 'first' | 'last';

/** The most rows that one preview holds (the popup's Show more, SPEC 15.3). */
export const MAX_PREVIEW_ROWS = 1000;

export interface PreviewData {
  columns: Column[];
  rows: Cell[][];
  /** Rows in the whole table; the preview holds at most 100 (up to 1,000 in the popup). */
  totalRows: number;
  /** Which rows these are: the first 100 of the table, or the last 100. */
  part: PreviewPart;
  /** The number of the first row shown (1 for the first part). */
  fromRow: number;
  /** What the load of the files did that the person should know (a stop text that was never found), in the current language. */
  warnings: string[];
}

let shared: Promise<SqlRunner> | null = null;

/** One DuckDB worker for all previews of the page. It starts at the first preview. */
export function previewRunner(): Promise<SqlRunner> {
  shared ??= createBrowserRunner().catch((e: unknown) => {
    shared = null;
    // The runner's message already says what failed and what to do next (browser-runner.ts).
    throw new EngineError('node_failed', `${e instanceof Error ? e.message : String(e)}.`);
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
  /** Test values of the parameters, by key. A parameter without a value uses its default. */
  parameterValues?: ParameterValues;
  /** The first 100 rows (the default) or the last 100, to see how the end of the file was read. */
  part?: PreviewPart;
  /** How many rows to read: 100 by default, never more than `MAX_PREVIEW_ROWS` and at least 1. */
  limit?: number;
  signal?: AbortSignal;
  /** Tests pass a Node runner here. */
  runner?: SqlRunner;
}

/** Runs the sub-flow in the browser and returns the first 100 rows of one table. Reference tables are the versions valid on the date. */
export async function runPreview(req: PreviewRequest): Promise<PreviewData> {
  const runner = req.runner ?? (await previewRunner());
  // A preview runs the steps up to the selected one, so it asks only for the parameters that these steps read.
  const definition = withUsedParametersOnly(req.definition);
  const parameterValues = initialValues(parametersOf(definition), req.parameterValues);
  const prepared = prepareRun({
    flowName: 'preview',
    flowVersions: [{ versionNo: 1, validFrom: '1900-01-01', validTo: null, definition }],
    refTables: req.refTables,
    effectiveDate: req.effectiveDate,
    // The builder's test runs read a draft version of a table that covers the date (DECISIONS: includeDrafts is for them).
    includeDrafts: true,
  });
  const result = await runFlow(runner, { flow: definition, parameterValues, effectiveDate: req.effectiveDate, files: req.files, refTables: prepared.refTables, signal: req.signal });
  try {
    const table = result.tables.get(`${req.nodeId}/${req.handle}`);
    const part = req.part ?? 'first';
    const total = table?.rowCount ?? 0;
    const limit = Math.min(MAX_PREVIEW_ROWS, Math.max(1, Math.floor(req.limit ?? PREVIEW_ROWS)));
    const offset = part === 'last' ? Math.max(0, total - limit) : 0;
    const data = await result.preview(req.nodeId, req.handle, limit, offset);
    return { columns: data.columns, rows: data.rows, totalRows: table?.rowCount ?? data.rows.length, part, fromRow: offset + 1, warnings: result.warnings.map(warningText) };
  } finally {
    await result.dispose();
  }
}
