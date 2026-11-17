// Helpers for node unit tests: run one node on an in-memory table through the real engine.
import { FLOW_SCHEMA_VERSION, type NodeType } from '../flow/types';
import { runFlow } from '../run';
import type { SqlRunner, TableData } from '../types';

export interface NodeRun {
  settings: Record<string, unknown>;
  /** Tables on the input handles in1, in2, ... or `in` for one input. Keyed by handle name. */
  inputs: Record<string, TableData>;
  refTables?: Record<string, TableData>;
  effectiveDate?: string;
  /** Output handle to read. Defaults to the first output. */
  handle?: string;
}

/** Wires each input table to its own input step, runs the node, and returns the rows of one output. */
export async function runNode(runner: SqlRunner, type: NodeType, run: NodeRun): Promise<TableData> {
  const handles = Object.keys(run.inputs);
  const nodes: unknown[] = handles.map((h) => ({ id: `src_${h}`, type: 'input_file', settings: { key: `k_${h}` } }));
  nodes.push({ id: 'under_test', type, settings: run.settings });
  const edges = handles.map((h) => ({ source: `src_${h}`, target: 'under_test', targetHandle: h }));
  const inputs: Record<string, TableData> = {};
  for (const h of handles) inputs[`k_${h}`] = run.inputs[h]!;
  const result = await runFlow(runner, {
    flow: { schemaVersion: FLOW_SCHEMA_VERSION, nodes, edges },
    effectiveDate: run.effectiveDate ?? '2026-09-30',
    inputs,
    refTables: run.refTables ?? {},
  });
  try {
    return await result.preview('under_test', run.handle);
  } finally {
    await result.dispose();
  }
}
