import { resolveEdgeHandles, topologicalOrder, validateFlow } from './flow/validate';
import { loadInputFile, parseInputSettings, type FileSource } from './input/load';
import { checkOutputNodes } from './nodes/output';
import { defaultRegistry } from './nodes/registry';
import type { NodeRegistry } from './nodes/types';
import { boundarySelectList, createTableStatements, quoteIdent } from './sql';
import { EngineError, type Column, type LoadedTable, type SqlRunner, type TableData } from './types';

export const PREVIEW_ROWS = 100;

export interface RunOptions {
  /** The flow definition, as parsed JSON. It is validated first. */
  flow: unknown;
  /** ISO date, for example `2026-09-30`. */
  effectiveDate: string;
  /** Input tables held in memory, by logical key. For small data and tests. */
  inputs?: Record<string, TableData>;
  /** Input files by logical key. Each input step reads the file of its key. */
  files?: Record<string, FileSource>;
  /** Reference tables by name, already resolved to the version valid on the effective date. */
  refTables?: Record<string, TableData>;
  registry?: NodeRegistry;
  signal?: AbortSignal;
  onNode?: (event: { nodeId: string; status: 'start' | 'done' }) => void;
}

export interface ResultTable extends LoadedTable {
  nodeId: string;
  handle: string;
  rowCount: number;
}

export interface RunResult {
  /** Every output of every node, keyed `nodeId/handle`. */
  tables: Map<string, ResultTable>;
  /** First rows of an output as boundary cells: numbers, ISO date text, text, booleans. */
  preview(nodeId: string, handle?: string, limit?: number): Promise<TableData>;
  /** Every row of an output, in the stored order. For writing files. */
  rows(nodeId: string, handle?: string): Promise<TableData>;
  /** Drops every table of this run. */
  dispose(): Promise<void>;
}

let runCounter = 0;

export async function runFlow(runner: SqlRunner, options: RunOptions): Promise<RunResult> {
  const validation = validateFlow(options.flow);
  if (!validation.ok) {
    throw new EngineError(
      'invalid_flow',
      `The flow cannot run. ${validation.errors.map((e) => e.message).join(' ')}`,
      validation.errors[0]?.nodeId,
    );
  }
  const flow = validation.flow;
  checkOutputNodes(flow);
  const registry = options.registry ?? defaultRegistry;
  const prefix = `r${++runCounter}_`;
  const created: string[] = [];
  const tables = new Map<string, ResultTable>();

  const dispose = async () => {
    for (const name of created.splice(0)) await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
  };
  const load = async (name: string, data: TableData): Promise<LoadedTable> => {
    const relation = `${prefix}${name}`;
    for (const statement of createTableStatements(relation, data)) await runner.exec(statement);
    created.push(relation);
    return { relation, columns: data.columns };
  };
  const onAbort = () => void runner.cancel();
  options.signal?.addEventListener('abort', onAbort);
  const checkCancelled = () => {
    if (options.signal?.aborted) {
      throw new EngineError('cancelled', 'The run was cancelled. Start it again when you are ready.');
    }
  };

  try {
    const inputTables: Record<string, LoadedTable> = {};
    for (const [i, [key, data]] of Object.entries(options.inputs ?? {}).entries()) {
      inputTables[key] = await load(`in${i}`, data);
    }
    const seenKeys = new Set<string>();
    for (const node of flow.nodes.filter((n) => n.type === 'input_file')) {
      const settings = parseInputSettings(node.settings, node.id);
      if (seenKeys.has(settings.key)) {
        throw new EngineError(
          'invalid_settings',
          `Two input steps use the key "${settings.key}". Give each input step its own key, because each key gets one file.`,
          node.id,
        );
      }
      seenKeys.add(settings.key);
      const file = options.files?.[settings.key];
      if (file) {
        options.onNode?.({ nodeId: node.id, status: 'start' });
        const relation = `${prefix}file${seenKeys.size}`;
        inputTables[settings.key] = await loadInputFile(runner, file, settings, relation, node.id);
        created.push(relation);
        options.onNode?.({ nodeId: node.id, status: 'done' });
      }
    }
    const refTables: Record<string, LoadedTable> = {};
    for (const [i, [name, data]] of Object.entries(options.refTables ?? {}).entries()) {
      refTables[name] = await load(`ref${i}`, data);
    }

    const edges = resolveEdgeHandles(flow);
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const order = topologicalOrder(flow);

    for (const [index, id] of order.entries()) {
      checkCancelled();
      const node = byId.get(id)!;
      const module = registry[node.type];
      if (!module) {
        throw new EngineError(
          'unsupported_node',
          `Step "${id}" is a ${node.type} step, which this version of the app cannot run yet. Remove it or update the app.`,
          id,
        );
      }
      options.onNode?.({ nodeId: id, status: 'start' });

      const inputs: Record<string, LoadedTable> = {};
      for (const e of edges.filter((x) => x.target === id)) {
        const upstream = tables.get(`${e.source}/${e.sourceHandle}`);
        if (upstream) inputs[e.targetHandle] = upstream;
      }
      const outputs = await module.compile({
        node,
        inputs,
        inputTables,
        refTables,
        effectiveDate: options.effectiveDate,
        query: (sql) => runner.query(sql),
      });

      // A node returns a table for each of its output handles. An Output step returns its table as `result`.
      for (const [handle, out] of Object.entries(outputs)) {
        const relation = `${prefix}n${index}_${handle}`;
        try {
          await runner.exec(`CREATE OR REPLACE TABLE ${quoteIdent(relation)} AS ${out.sql}`);
        } catch (e) {
          checkCancelled();
          const reason = e instanceof Error ? e.message : String(e);
          throw new EngineError(
            'node_failed',
            `Step "${id}" failed: ${reason} Open the step, check its settings and run again.`,
            id,
          );
        }
        created.push(relation);
        const count = await runner.query(`SELECT count(*) AS c FROM ${quoteIdent(relation)}`);
        tables.set(`${id}/${handle}`, {
          nodeId: id,
          handle,
          relation,
          columns: out.columns,
          rowCount: Number(count.rows[0]?.[0] ?? 0),
        });
      }
      options.onNode?.({ nodeId: id, status: 'done' });
    }
  } catch (e) {
    await dispose();
    throw e;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }

  const read = async (nodeId: string, handle: string | undefined, limit: number | undefined): Promise<TableData> => {
    const table = handle ? tables.get(`${nodeId}/${handle}`) : [...tables.values()].find((t) => t.nodeId === nodeId);
    if (!table) {
      throw new EngineError('node_failed', `Step "${nodeId}" has no result to show. Run the flow first.`, nodeId);
    }
    const columns: Column[] = table.columns;
    const cap = limit === undefined ? '' : ` LIMIT ${Math.max(0, Math.floor(limit))}`;
    const result = await runner.query(`SELECT ${boundarySelectList(columns)} FROM ${quoteIdent(table.relation)}${cap}`);
    return { columns, rows: result.rows as TableData['rows'] };
  };

  return {
    tables,
    dispose,
    preview: (nodeId, handle, limit = PREVIEW_ROWS) => read(nodeId, handle, limit),
    rows: (nodeId, handle) => read(nodeId, handle, undefined),
  };
}
