import { getLocale, warningText } from '../i18n';
import { parseOutputSettings } from '../../engine/nodes/output';
import { resolveFlow } from '../../engine/run';
import { buildOutputFiles } from '../../engine/output/export';
import type { OutputFile } from '../../engine/output/export';
import { runFlow } from '../../engine/run';
import type { ParameterValues } from '../../engine/flow/parameter-values';
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
  /** What the load of the input files did that the person should know, in the current language. */
  warnings: string[];
}

export interface RunRequest {
  /** The name of the flow, for the token {flow} of a print layout. */
  flowName?: string;
  definition: FlowDefinition;
  effectiveDate: string;
  /** The values of the flow parameters, by key. They stay in the browser. */
  parameterValues?: ParameterValues;
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
  // The settings after the parameters are put in: the names of the files and sheets may come from a parameter.
  const definition = resolveFlow(req.definition, req.parameterValues).flow;
  const labels = new Map(definition.nodes.map((n) => [n.id, n.label ?? n.id]));
  const total = definition.nodes.length;
  let started = 0;
  const result = await runFlow(runner, {
    flow: req.definition, // runFlow puts the values in itself; the resolved copy is only for reading the settings below
    effectiveDate: req.effectiveDate,
    parameterValues: req.parameterValues,
    files: Object.fromEntries(Object.entries(req.files).map(([k, f]) => [k, { name: f.name, size: f.size, blob: f }])),
    refTables: req.refTables,
    signal: req.signal,
    onNode: (e) => {
      if (e.status === 'start') req.onProgress(++started, total, labels.get(e.nodeId) ?? e.nodeId);
    },
  });
  try {
    const sheets: SheetPreview[] = [];
    for (const node of definition.nodes.filter((n) => n.type === 'output')) {
      const s = parseOutputSettings(node.settings, node.id);
      const table = result.tables.get(`${node.id}/result`);
      sheets.push({ file: s.file, sheet: s.sheet ?? s.file, rowCount: table?.rowCount ?? 0, table: await result.preview(node.id, 'result') });
    }
    const parameters = Object.fromEntries(Object.entries(req.parameterValues ?? {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));
    // The fixed words of a printed report (the footer) follow the language of the app; the rest of the layout is as it was typed.
    const files = await buildOutputFiles(result, definition, { flowName: req.flowName ?? definition.name ?? '', effectiveDate: req.effectiveDate, parameters, language: getLocale() === 'vi' ? 'vi' : 'en' });
    const inputRows = definition.nodes.filter((n) => n.type === 'input_file').reduce((n, node) => n + (result.tables.get(`${node.id}/out`)?.rowCount ?? 0), 0);
    return { files, sheets, inputRows, outputRows: sheets.reduce((n, s) => n + s.rowCount, 0), warnings: result.warnings.map(warningText) };
  } finally {
    await result.dispose();
  }
}
