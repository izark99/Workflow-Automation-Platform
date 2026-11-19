import { PARAMETER_TYPES } from './parameters';
import type { FlowParameter } from './parameters';

/**
 * Flow definition: the single JSON format that the canvas writes and the engine runs.
 *
 * The shape follows React Flow (`nodes` with `position`, `edges` with named handles), so the
 * canvas needs no conversion. Settings of each node type are validated by the module of that
 * node type; this file only knows the envelope and the ports.
 */

/** The first format. A new flow and every flow without parameters stay in it. */
export const BASE_SCHEMA_VERSION = 1;
/** The latest format: it may carry `parameters`. Older definitions load with an empty list, and are never rewritten. */
export const FLOW_SCHEMA_VERSION = 2;
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;

export const NODE_TYPES = [
  'input_file',
  'column_mapping',
  'filter',
  'formula_column',
  'lookup_join',
  'group_by',
  'unpivot',
  'pivot',
  'append',
  'output',
  'sql',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export interface FlowNode {
  id: string;
  type: NodeType;
  /** Name shown on the canvas. */
  label?: string;
  /** Canvas position. The engine ignores it. */
  position?: { x: number; y: number };
  /** Settings of the node type. Validated by the node module. */
  settings: Record<string, unknown>;
}

export interface FlowEdge {
  id?: string;
  source: string;
  /** Output handle of the source node. Defaults to the first output of its type. */
  sourceHandle?: string;
  target: string;
  /** Input handle of the target node. Defaults to the first input of its type. */
  targetHandle?: string;
}

export interface FlowDefinition {
  schemaVersion: (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
  name?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** From schemaVersion 2. Missing in a version 1 definition, which means no parameters. */
  parameters?: FlowParameter[];
}

export interface FlowEdgeResolved {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

/** An input handle of a fixed set of handles. */
export interface FixedInput {
  name: string;
  required: boolean;
}

export type NodeInputs =
  /** A named set of handles, for example `left` and `right` of a lookup. */
  | { kind: 'fixed'; handles: readonly FixedInput[] }
  /** Handles `in1`, `in2`, ... with no gap. The number gives the order. */
  | { kind: 'variadic'; min: number };

export interface NodePorts {
  inputs: NodeInputs;
  outputs: readonly string[];
}

export const NODE_PORTS: Readonly<Record<NodeType, NodePorts>> = {
  input_file: { inputs: { kind: 'fixed', handles: [] }, outputs: ['out'] },
  column_mapping: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['out'] },
  filter: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['match', 'nomatch'] },
  formula_column: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['out'] },
  lookup_join: {
    inputs: {
      kind: 'fixed',
      handles: [
        { name: 'left', required: true },
        // Needed only when the lookup reads another node. A reference table is named in the settings.
        { name: 'right', required: false },
      ],
    },
    outputs: ['out'],
  },
  group_by: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['out'] },
  unpivot: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['out'] },
  pivot: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: ['out'] },
  append: { inputs: { kind: 'variadic', min: 2 }, outputs: ['out'] },
  output: { inputs: { kind: 'fixed', handles: [{ name: 'in', required: true }] }, outputs: [] },
  sql: { inputs: { kind: 'variadic', min: 1 }, outputs: ['out'] },
};

export const VARIADIC_HANDLE = /^in([1-9]\d*)$/;

/** JSON schema of the envelope (draft-07). Settings are checked per node type, not here. */
export const flowJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Data flow definition',
  type: 'object',
  required: ['schemaVersion', 'nodes', 'edges'],
  properties: {
    schemaVersion: { enum: [...SUPPORTED_SCHEMA_VERSIONS] },
    name: { type: 'string' },
    parameters: {
      type: 'array',
      description: 'From schemaVersion 2. Each key is unique without regard to case.',
      items: {
        type: 'object',
        required: ['key', 'label', 'type', 'required'],
        properties: {
          key: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$', maxLength: 40 },
          label: { type: 'string', minLength: 1 },
          type: { enum: [...PARAMETER_TYPES] },
          required: { type: 'boolean' },
          default: { type: ['string', 'number', 'boolean'] },
          options: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
          help: { type: 'string' },
        },
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'settings'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { enum: [...NODE_TYPES] },
          label: { type: 'string' },
          position: {
            type: 'object',
            required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
          settings: { type: 'object' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string', minLength: 1 },
          sourceHandle: { type: 'string' },
          target: { type: 'string', minLength: 1 },
          targetHandle: { type: 'string' },
        },
      },
    },
  },
} as const;
