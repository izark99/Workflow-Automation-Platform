import { engineText } from '../messages';
import type { EngineMessageId, MessageParams } from '../messages';
import { MAX_PARAMETER_KEY_LENGTH, PARAMETER_KEY, PARAMETER_TYPES, fitsParameterType } from './parameters';
import type { FlowParameter, ParameterType } from './parameters';
import { parsePrintSettings, PrintSettingsError } from '../output/print/settings';
import { PRINT_TOKENS, printTokenProblems } from '../output/print/tokens';
import { isBindable } from './bindable';
import { containsBindingKey, isParamBinding } from './bindings';
import {
  BINDINGS_SCHEMA_VERSION,
  FLOW_SCHEMA_VERSION,
  NEW_STEP_TYPES,
  PRINT_SCHEMA_VERSION,
  STEPS_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  NODE_PORTS,
  NODE_TYPES,
  VARIADIC_HANDLE,
  type FlowDefinition,
  type FlowEdge,
  type FlowEdgeResolved,
  type FlowNode,
  type NodeType,
} from './types';

export type FlowErrorCode =
  | 'invalid_shape'
  | 'unsupported_schema_version'
  | 'duplicate_node_id'
  | 'unknown_node_type'
  | 'unknown_node'
  | 'unknown_handle'
  | 'missing_input'
  | 'input_connected_twice'
  | 'cycle'
  | 'invalid_parameters'
  | 'invalid_print_layout';

export interface FlowError {
  code: FlowErrorCode;
  /** Says what failed and what to do next. */
  message: string;
  nodeId?: string;
  /** Id of the message in the catalog, with its parameters (the UI shows its own text). */
  messageId?: string;
  params?: MessageParams;
}

export type FlowValidation = { ok: true; flow: FlowDefinition } | { ok: false; errors: FlowError[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isNodeType = (v: unknown): v is NodeType => typeof v === 'string' && (NODE_TYPES as readonly string[]).includes(v);

function inputHandleNames(type: NodeType): string[] | 'variadic' {
  const p = NODE_PORTS[type].inputs;
  return p.kind === 'fixed' ? p.handles.map((h) => h.name) : 'variadic';
}

function defaultTargetHandle(type: NodeType): string | undefined {
  const names = inputHandleNames(type);
  return names === 'variadic' ? 'in1' : names[0];
}

function isInputHandle(type: NodeType, handle: string): boolean {
  const names = inputHandleNames(type);
  return names === 'variadic' ? VARIADIC_HANDLE.test(handle) : names.includes(handle);
}

/** Checks the envelope, the node types, the edges, the required inputs and cycles. */
export function validateFlow(input: unknown): FlowValidation {
  if (!isRecord(input)) {
    return fail({
      code: 'invalid_shape',
      message: 'The flow is not a JSON object. Use an object with schemaVersion, nodes and edges.',
    });
  }
  const errors: FlowError[] = [];

  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(input.schemaVersion)) {
    errors.push({
      code: 'unsupported_schema_version',
      message: `The flow has schemaVersion ${JSON.stringify(input.schemaVersion)}, but this app reads versions ${SUPPORTED_SCHEMA_VERSIONS.slice(0, -1).join(', ')} and ${SUPPORTED_SCHEMA_VERSIONS[SUPPORTED_SCHEMA_VERSIONS.length - 1]}. Change schemaVersion to ${FLOW_SCHEMA_VERSION} or open the flow in a matching app version.`,
    });
  }
  const parameters = parametersFrom(input, errors);
  if (!Array.isArray(input.nodes)) {
    errors.push({ code: 'invalid_shape', message: 'The flow has no "nodes" list. Add "nodes" as an array of steps.' });
  }
  if (!Array.isArray(input.edges)) {
    errors.push({ code: 'invalid_shape', message: 'The flow has no "edges" list. Add "edges" as an array, which may be empty.' });
  }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) return { ok: false, errors };

  const nodes: FlowNode[] = [];
  const byId = new Map<string, FlowNode>();
  input.nodes.forEach((raw: unknown, index: number) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') {
      errors.push({
        code: 'invalid_shape',
        message: `Step ${index + 1} has no id. Add a non-empty text "id" to every step.`,
      });
      return;
    }
    const id = raw.id;
    if (!isRecord(raw.settings)) {
      errors.push({
        code: 'invalid_shape',
        nodeId: id,
        message: `Step "${id}" has no "settings" object. Add "settings": {} to the step.`,
      });
      return;
    }
    if (!isNodeType(raw.type)) {
      errors.push({
        code: 'unknown_node_type',
        nodeId: id,
        message: `Step "${id}" has the unknown type ${JSON.stringify(raw.type)}. Use one of: ${NODE_TYPES.join(', ')}.`,
      });
      return;
    }
    if (byId.has(id)) {
      errors.push({
        code: 'duplicate_node_id',
        nodeId: id,
        message: `Two steps use the id "${id}". Rename one of them so that every id is unique.`,
      });
      return;
    }
    const node = raw as unknown as FlowNode;
    byId.set(id, node);
    nodes.push(node);
  });
  checkBindings(input.schemaVersion, nodes, parameters, errors);
  checkStepVersions(input.schemaVersion, nodes, errors);
  checkPrintLayouts(input.schemaVersion, nodes, parameters, errors);

  const validEdges: FlowEdge[] = [];
  input.edges.forEach((raw: unknown, index: number) => {
    if (!isRecord(raw) || typeof raw.source !== 'string' || typeof raw.target !== 'string') {
      errors.push({
        code: 'invalid_shape',
        message: `Connection ${index + 1} needs a "source" and a "target" step id. Add both, or remove the connection.`,
      });
      return;
    }
    const edge = raw as unknown as FlowEdge;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    let ok = true;
    for (const [role, id, n] of [
      ['source', edge.source, source],
      ['target', edge.target, target],
    ] as const) {
      if (!n) {
        ok = false;
        errors.push({
          code: 'unknown_node',
          nodeId: id,
          message: `A connection uses the ${role} step "${id}", which does not exist. Remove the connection or add the step.`,
        });
      }
    }
    if (!source || !target) return;

    const outputs = NODE_PORTS[source.type].outputs;
    const sourceHandle = edge.sourceHandle ?? outputs[0];
    if (sourceHandle === undefined || !outputs.includes(sourceHandle)) {
      ok = false;
      errors.push({
        code: 'unknown_handle',
        nodeId: source.id,
        message:
          outputs.length === 0
            ? `Step "${source.id}" (${source.type}) has no output, so nothing can be connected from it. Remove the connection.`
            : `Step "${source.id}" (${source.type}) has no output "${edge.sourceHandle}". Use one of: ${outputs.join(', ')}.`,
      });
    }
    const targetHandle = edge.targetHandle ?? defaultTargetHandle(target.type);
    if (targetHandle === undefined || !isInputHandle(target.type, targetHandle)) {
      ok = false;
      const names = inputHandleNames(target.type);
      errors.push({
        code: 'unknown_handle',
        nodeId: target.id,
        message:
          names !== 'variadic' && names.length === 0
            ? `Step "${target.id}" (${target.type}) takes no input. Remove the connection into it.`
            : `Step "${target.id}" (${target.type}) has no input "${edge.targetHandle}". Use ${
                names === 'variadic' ? 'in1, in2, ...' : `one of: ${names.join(', ')}`
              }.`,
      });
    }
    if (ok) validEdges.push(edge);
  });

  // Inputs: connected at most once, required ones connected.
  const connected = new Map<string, Map<string, number>>();
  for (const e of validEdges) {
    const target = byId.get(e.target);
    if (!target) continue;
    const handle = e.targetHandle ?? defaultTargetHandle(target.type) ?? '';
    const handles = connected.get(target.id) ?? new Map<string, number>();
    handles.set(handle, (handles.get(handle) ?? 0) + 1);
    connected.set(target.id, handles);
  }
  for (const node of nodes) {
    const handles = connected.get(node.id) ?? new Map<string, number>();
    for (const [handle, count] of handles) {
      if (count > 1) {
        errors.push({
          code: 'input_connected_twice',
          nodeId: node.id,
          message: `Input "${handle}" of step "${node.id}" has ${count} connections. Remove all but one, or use an Append step to stack several inputs.`,
        });
      }
    }
    const ports = NODE_PORTS[node.type].inputs;
    if (ports.kind === 'fixed') {
      for (const h of ports.handles) {
        if (h.required && !handles.has(h.name)) {
          errors.push({
            code: 'missing_input',
            nodeId: node.id,
            message: `Step "${node.id}" (${node.type}) has no connection on its "${h.name}" input. Connect a step to it.`,
          });
        }
      }
    } else {
      const numbers = [...handles.keys()].map((h) => Number(VARIADIC_HANDLE.exec(h)?.[1] ?? 0)).sort((a, b) => a - b);
      const contiguous = numbers.every((n, i) => n === i + 1);
      if (numbers.length < ports.min || !contiguous) {
        errors.push({
          code: 'missing_input',
          nodeId: node.id,
          message: !contiguous
            ? `Step "${node.id}" (${node.type}) skips an input number (it has ${numbers.map((n) => `in${n}`).join(', ')}). Connect the missing input or renumber, so that inputs run in1, in2, ... without a gap.`
            : `Step "${node.id}" (${node.type}) needs at least ${ports.min} connected input${ports.min === 1 ? '' : 's'} and has ${numbers.length}. Connect more steps to in1${ports.min > 1 ? ', in2, ...' : ''}.`,
        });
      }
    }
  }

  const cycle = findCycle(nodes, validEdges);
  if (cycle) {
    errors.push({
      code: 'cycle',
      nodeId: cycle[0],
      message: `The steps form a loop: ${cycle.join(' -> ')}. Remove one connection on the loop, because a step cannot depend on its own result.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  // A copy with the normalized list: the input (a stored definition) is never changed.
  return { ok: true, flow: { ...(input as unknown as FlowDefinition), parameters } };
}

function fail(error: FlowError): FlowValidation {
  return { ok: false, errors: [error] };
}

/** Returns the ids of one cycle, with the first id repeated at the end, or undefined. */
function findCycle(nodes: FlowNode[], edges: FlowEdge[]): string[] | undefined {
  const next = new Map<string, string[]>();
  for (const n of nodes) next.set(n.id, []);
  for (const e of edges) next.get(e.source)?.push(e.target);

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | undefined => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const t of next.get(id) ?? []) {
      if (state.get(t) === 'visiting') return [...stack.slice(stack.indexOf(t)), t];
      if (!state.has(t)) {
        const found = visit(t);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return undefined;
  };
  for (const n of nodes) {
    if (!state.has(n.id)) {
      const found = visit(n.id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Edges with both handles filled in. Call it on a validated flow. */
export function resolveEdgeHandles(flow: FlowDefinition): FlowEdgeResolved[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  return flow.edges.map((e) => {
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    return {
      source: e.source,
      sourceHandle: e.sourceHandle ?? (source ? NODE_PORTS[source.type].outputs[0] : undefined) ?? 'out',
      target: e.target,
      targetHandle: e.targetHandle ?? (target ? defaultTargetHandle(target.type) : undefined) ?? 'in',
    };
  });
}

/**
 * Node ids in dependency order. Among nodes that are ready at the same time, the one that
 * comes first in `flow.nodes` goes first, so the order is stable. Call it on a validated flow.
 */
export function topologicalOrder(flow: FlowDefinition): string[] {
  const index = new Map(flow.nodes.map((n, i) => [n.id, i]));
  const waiting = new Map<string, number>(flow.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(flow.nodes.map((n) => [n.id, []]));
  for (const e of flow.edges) {
    waiting.set(e.target, (waiting.get(e.target) ?? 0) + 1);
    next.get(e.source)?.push(e.target);
  }
  const ready = flow.nodes.filter((n) => waiting.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const id = ready.shift() as string;
    order.push(id);
    for (const t of next.get(id) ?? []) {
      const left = (waiting.get(t) ?? 0) - 1;
      waiting.set(t, left);
      if (left === 0) ready.push(t);
    }
  }
  return order;
}

/** A step of Phase 8 needs schemaVersion 4 (SPEC 15.4); older definitions never hold one. */
function checkStepVersions(schemaVersion: unknown, nodes: FlowNode[], errors: FlowError[]): void {
  // Version 4 and the versions after it allow the steps.
  if (typeof schemaVersion === 'number' && schemaVersion >= STEPS_SCHEMA_VERSION) return;
  for (const node of nodes) {
    if (!(NEW_STEP_TYPES as readonly string[]).includes(node.type)) continue;
    errors.push({ ...paramError('engine.stepNeedsV4', { step: node.label ?? node.id, type: node.type }), nodeId: node.id });
  }
}

/** A print layout needs schemaVersion 5, and its tokens and parameters must exist (SPEC 16.1 item 4). */
function checkPrintLayouts(schemaVersion: unknown, nodes: FlowNode[], parameters: FlowParameter[], errors: FlowError[]): void {
  const keys = parameters.map((p) => p.key);
  for (const node of nodes) {
    if (node.type !== 'output' || node.settings.print === undefined) continue;
    const step = node.label ?? node.id;
    if (typeof schemaVersion !== 'number' || schemaVersion < PRINT_SCHEMA_VERSION) {
      errors.push({ ...paramError('engine.printNeedsV5', { step }), nodeId: node.id });
      continue;
    }
    let print: ReturnType<typeof parsePrintSettings>;
    try {
      print = parsePrintSettings(node.settings.print);
    } catch (e) {
      if (e instanceof PrintSettingsError) {
        errors.push({ code: 'invalid_print_layout', message: `Output step "${step}": ${e.message} Change it in the print layout of the step.`, nodeId: node.id });
        continue;
      }
      throw e;
    }
    for (const problem of printTokenProblems(print, keys)) {
      errors.push(
        problem.kind === 'param'
          ? { ...paramError('engine.printParam', { step, token: problem.token, where: problem.where, key: problem.key ?? '' }), nodeId: node.id }
          : { ...paramError('engine.printToken', { step, token: problem.token, where: problem.where, tokens: [...PRINT_TOKENS, 'param:key'].map((t) => `{${t}}`).join(' ') }), nodeId: node.id },
      );
    }
  }
}

/** The bindings of the settings (SPEC 13.3): their shape, their parameter, and that they sit in a single-value setting. */
function checkBindings(schemaVersion: unknown, nodes: FlowNode[], parameters: FlowParameter[], errors: FlowError[]): void {
  const known = new Set(parameters.map((p) => p.key));
  for (const node of nodes) {
    const step = node.label ?? node.id;
    const add = (id: EngineMessageId, params: MessageParams): void => {
      errors.push({ ...paramError(id, { step, ...params }), nodeId: node.id });
    };
    for (const [setting, value] of Object.entries(node.settings)) {
      if (isRecord(value) && '$param' in value) {
        if (!isParamBinding(value)) {
          add('engine.bindShape', { setting });
          continue;
        }
        if (typeof schemaVersion !== 'number' || schemaVersion < BINDINGS_SCHEMA_VERSION) add('engine.bindNeedsV3', { setting });
        if (!isBindable(node.type, setting)) {
          add('engine.bindNotHere', { setting });
          continue;
        }
        if (!known.has(value.$param)) add('engine.bindUnknown', { setting, key: value.$param });
      } else if (containsBindingKey(value)) add('engine.bindNotHere', { setting });
    }
  }
}

const paramError = (id: EngineMessageId, params: MessageParams = {}): FlowError => ({ code: 'invalid_parameters', message: engineText(id, params), messageId: id, params });

/**
 * The parameters of a definition (SPEC 11.5): an empty list for an older definition. A version 1 definition that has a
 * `parameters` key is refused instead of ignored, so nobody loses them without being told.
 */
function parametersFrom(input: Record<string, unknown>, errors: FlowError[]): FlowParameter[] {
  if (input.parameters === undefined) return [];
  if (input.schemaVersion === 1) {
    errors.push(paramError('engine.paramNeedsV2', { version: 1 }));
    return [];
  }
  if (!Array.isArray(input.parameters)) {
    errors.push(paramError('engine.paramNotList'));
    return [];
  }
  const out: FlowParameter[] = [];
  const seen = new Set<string>();
  input.parameters.forEach((raw: unknown, index: number) => {
    const n = index + 1;
    if (!isRecord(raw)) {
      errors.push(paramError('engine.paramShape', { n }));
      return;
    }
    const key = typeof raw.key === 'string' ? raw.key : '';
    if (!PARAMETER_KEY.test(key) || key.length > MAX_PARAMETER_KEY_LENGTH) {
      errors.push(paramError('engine.paramKey', { n, key, max: MAX_PARAMETER_KEY_LENGTH }));
      return;
    }
    if (seen.has(key.toLowerCase())) {
      errors.push(paramError('engine.paramDuplicateKey', { key }));
      return;
    }
    seen.add(key.toLowerCase());
    const before = errors.length;
    if (typeof raw.label !== 'string' || raw.label.trim() === '') errors.push(paramError('engine.paramLabel', { key }));
    if (!(PARAMETER_TYPES as readonly unknown[]).includes(raw.type)) {
      errors.push(paramError('engine.paramType', { key, type: String(raw.type), types: PARAMETER_TYPES.join(', ') }));
      return;
    }
    const type = raw.type as ParameterType;
    if (typeof raw.required !== 'boolean') errors.push(paramError('engine.paramRequired', { key }));
    if (raw.help !== undefined && typeof raw.help !== 'string') errors.push(paramError('engine.paramHelp', { key }));
    let options: string[] | undefined;
    if (type === 'list') {
      const list = raw.options;
      if (!Array.isArray(list) || list.length === 0) errors.push(paramError('engine.paramOptions', { key }));
      else if (list.some((o) => typeof o !== 'string' || o === '') || new Set(list).size !== list.length) errors.push(paramError('engine.paramOptionBad', { key }));
      else options = list as string[];
    }
    if (raw.default !== undefined && !fitsParameterType({ type, options }, raw.default)) {
      const id = { date: 'engine.paramDefaultDate', number: 'engine.paramDefaultNumber', boolean: 'engine.paramDefaultBoolean', text: 'engine.paramDefaultText', list: 'engine.paramDefaultList' }[type] as EngineMessageId;
      if (!(type === 'list' && options === undefined)) errors.push(paramError(id, { key }));
    }
    if (errors.length === before) out.push(options ? { ...(raw as unknown as FlowParameter), options } : { ...(raw as unknown as FlowParameter) });
  });
  return out;
}
