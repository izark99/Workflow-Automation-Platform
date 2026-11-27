import { describe, expect, it } from 'vitest';
import { validateFlow } from '../../engine/flow/validate';
import { addStep, arrangeSteps, restorePositions, connectSteps, currentSource, deleteEdges, deleteSteps, emptyDefinition, inputHandlesOf, inputTitle, moveStep, nextFreePosition, setInput, sourceOptions, stepNumbers, STEP_CATALOG, STEP_GROUPS } from './graph';
import type { FlowDefinition } from '../../engine/flow/types';
import { NODE_TYPES } from '../../engine/flow/types';

const build = (types: Parameters<typeof addStep>[1][]): { def: FlowDefinition; ids: string[] } => {
  let def = emptyDefinition();
  const ids: string[] = [];
  for (const t of types) {
    const r = addStep(def, t, nextFreePosition(def));
    def = r.definition;
    ids.push(r.id);
  }
  return { def, ids };
};
const link = (def: FlowDefinition, a: string, b: string, sh: string | null = null, th: string | null = null) => {
  const r = connectSteps(def, { source: a, sourceHandle: sh, target: b, targetHandle: th });
  if (!r.ok) throw new Error(r.reason);
  return r.definition;
};

describe('catalog', () => {
  it('names every node type once and lists each in exactly one group', () => {
    expect(Object.keys(STEP_CATALOG).sort()).toEqual([...NODE_TYPES].sort());
    expect(STEP_GROUPS.flatMap((g) => g.types).sort()).toEqual([...NODE_TYPES].sort());
  });
});

describe('addStep', () => {
  it('adds a step with an id, a label and a position, and keeps the other steps', () => {
    const { def, ids } = build(['input_file', 'filter']);
    expect(ids).toEqual(['input_file-1', 'filter-1']);
    expect(def.nodes.map((n) => n.label)).toEqual(['Input file', 'Filter']);
    expect(def.nodes[1]?.position).toEqual({ x: 0, y: 96 });
  });
  it('numbers the label and the id of a second step of the same type', () => {
    const { def } = build(['input_file', 'input_file']);
    expect(def.nodes.map((n) => n.id)).toEqual(['input_file-1', 'input_file-2']);
    expect(def.nodes.map((n) => n.label)).toEqual(['Input file', 'Input file 2']);
  });
  it('never reuses an id after a delete in the middle', () => {
    let { def } = build(['filter', 'filter']);
    def = deleteSteps(def, ['filter-1']);
    const r = addStep(def, 'filter', { x: 0, y: 0 });
    expect(r.id).toBe('filter-3');
  });
  it('rounds a dropped position to whole pixels', () => {
    expect(addStep(emptyDefinition(), 'sql', { x: 10.6, y: 20.2 }).definition.nodes[0]?.position).toEqual({ x: 11, y: 20 });
  });
  it('moveStep changes one position only', () => {
    const { def } = build(['input_file', 'filter']);
    const moved = moveStep(def, 'filter-1', { x: 300, y: 5 });
    expect(moved.nodes[1]?.position).toEqual({ x: 300, y: 5 });
    expect(moved.nodes[0]).toEqual(def.nodes[0]);
  });
});

describe('connectSteps', () => {
  it('connects an output to the input of the next step with explicit handles, and the result is a valid flow', () => {
    const { def } = build(['input_file', 'column_mapping', 'output']);
    const d = link(link(def, 'input_file-1', 'column_mapping-1'), 'column_mapping-1', 'output-1');
    expect(d.edges.map((e) => [e.sourceHandle, e.targetHandle])).toEqual([['out', 'in'], ['out', 'in']]);
    expect(validateFlow(d).ok).toBe(true);
  });
  it('a Filter has two outputs and a Lookup two inputs', () => {
    const { def } = build(['input_file', 'filter', 'lookup_join']);
    const d = link(link(def, 'input_file-1', 'filter-1'), 'filter-1', 'lookup_join-1', 'nomatch', 'right');
    expect(d.edges[1]).toMatchObject({ sourceHandle: 'nomatch', targetHandle: 'right' });
  });
  it('refuses a step that feeds itself, a second input on a single port, and a loop, with a reason that says what to do', () => {
    const { def } = build(['input_file', 'input_file', 'filter', 'column_mapping']);
    const self = connectSteps(def, { source: 'filter-1', sourceHandle: null, target: 'filter-1', targetHandle: null });
    expect(self).toMatchObject({ ok: false });
    const a = link(def, 'input_file-1', 'filter-1');
    const twice = connectSteps(a, { source: 'input_file-2', sourceHandle: null, target: 'filter-1', targetHandle: null });
    expect(twice).toMatchObject({ ok: false });
    expect((twice as { reason: string }).reason).toMatch(/already has an input.*Delete the existing connection/);
    const two = build(['filter', 'column_mapping']).def;
    const b = link(two, 'filter-1', 'column_mapping-1', 'match');
    const loop = connectSteps(b, { source: 'column_mapping-1', sourceHandle: null, target: 'filter-1', targetHandle: null });
    expect((loop as { reason: string }).reason).toMatch(/loop/);
  });
  it('an Output has no output and an Input file has no input', () => {
    const { def } = build(['input_file', 'output']);
    expect(connectSteps(def, { source: 'output-1', sourceHandle: null, target: 'input_file-1', targetHandle: null })).toMatchObject({ ok: false });
    expect(connectSteps(def, { source: 'input_file-1', sourceHandle: null, target: 'input_file-1', targetHandle: 'in' })).toMatchObject({ ok: false });
  });
  it('an unknown step id is reported', () => {
    expect(connectSteps(emptyDefinition(), { source: 'a', sourceHandle: null, target: 'b', targetHandle: null })).toMatchObject({ ok: false });
  });
});

describe('Append and SQL inputs', () => {
  it('show the connected inputs plus one free port, at least two for Append', () => {
    const { def } = build(['input_file', 'input_file', 'input_file', 'append']);
    const ap = def.nodes[3]!;
    expect(inputHandlesOf(def, ap)).toEqual(['in1', 'in2']);
    const d1 = link(def, 'input_file-1', 'append-1', null, 'in1');
    const d2 = link(d1, 'input_file-2', 'append-1', null, 'in2');
    expect(inputHandlesOf(d2, ap)).toEqual(['in1', 'in2', 'in3']);
    expect(connectSteps(d2, { source: 'input_file-3', sourceHandle: null, target: 'append-1', targetHandle: 'in3' })).toMatchObject({ ok: true });
  });
  it('removing an input closes the gap: in1, in3 become in1, in2', () => {
    const { def } = build(['input_file', 'input_file', 'input_file', 'append']);
    let d = link(def, 'input_file-1', 'append-1', null, 'in1');
    d = link(d, 'input_file-2', 'append-1', null, 'in2');
    d = link(d, 'input_file-3', 'append-1', null, 'in3');
    const after = deleteSteps(d, ['input_file-2']);
    expect(after.edges.map((e) => [e.source, e.targetHandle])).toEqual([['input_file-1', 'in1'], ['input_file-3', 'in2']]);
  });
});

describe('delete and numbering', () => {
  it('deleting a step removes the connections that touch it', () => {
    const { def } = build(['input_file', 'filter', 'output']);
    const d = link(link(def, 'input_file-1', 'filter-1'), 'filter-1', 'output-1', 'match');
    const after = deleteSteps(d, ['filter-1']);
    expect(after.nodes.map((n) => n.id)).toEqual(['input_file-1', 'output-1']);
    expect(after.edges).toEqual([]);
  });
  it('deleteEdges removes only the named connection', () => {
    const { def } = build(['input_file', 'filter', 'output']);
    const d = link(link(def, 'input_file-1', 'filter-1'), 'filter-1', 'output-1', 'match');
    const id = d.edges[0]!.id!;
    expect(deleteEdges(d, [id]).edges).toHaveLength(1);
  });
  it('numbers steps in dependency order, not in list order', () => {
    const { def } = build(['output', 'filter', 'input_file']);
    const d = link(link(def, 'input_file-1', 'filter-1'), 'filter-1', 'output-1', 'match');
    const n = stepNumbers(d);
    expect([n.get('input_file-1'), n.get('filter-1'), n.get('output-1')]).toEqual([1, 2, 3]);
  });
  it('gives steps without a connection a number too', () => {
    expect([...stepNumbers(build(['sql', 'sql']).def).values()].sort()).toEqual([1, 2]);
  });
  it('nextFreePosition starts at the origin and goes 96 px below the lowest step', () => {
    expect(nextFreePosition(emptyDefinition())).toEqual({ x: 0, y: 0 });
    expect(nextFreePosition(build(['sql', 'sql']).def)).toEqual({ x: 0, y: 192 });
  });
});

describe('input choices (the keyboard way to connect)', () => {
  it('lists None first, then each other step with its number, once per output, and never a step downstream of this one', () => {
    const { def } = build(['input_file', 'filter', 'output']);
    const d = link(def, 'input_file-1', 'filter-1');
    const forOutput = sourceOptions(d, 'output-1').map((o) => o.label);
    expect(forOutput).toEqual(['None', '1. Input file', '3. Filter (match)', '3. Filter (no match)']);
    // The output is downstream of nothing yet; the filter's own options must not offer itself or what comes after it.
    const chain = link(d, 'filter-1', 'output-1', 'match');
    expect(sourceOptions(chain, 'filter-1').map((o) => o.label)).toEqual(['None', '1. Input file']);
  });
  it('reads the current source of a port', () => {
    const { def } = build(['input_file', 'filter']);
    const d = link(def, 'input_file-1', 'filter-1');
    expect(currentSource(d, 'filter-1', 'in')).toBe('input_file-1:out');
    expect(currentSource(def, 'filter-1', 'in')).toBe('');
  });
  it('sets, replaces and clears an input', () => {
    const { def } = build(['input_file', 'input_file', 'filter']);
    const a = setInput(def, 'filter-1', 'in', 'input_file-1:out');
    expect(a.ok && a.definition.edges).toHaveLength(1);
    const b = setInput((a as { definition: FlowDefinition }).definition, 'filter-1', 'in', 'input_file-2:out');
    expect(b.ok && b.definition.edges.map((e) => e.source)).toEqual(['input_file-2']);
    const c = setInput((b as { definition: FlowDefinition }).definition, 'filter-1', 'in', '');
    expect(c.ok && c.definition.edges).toEqual([]);
    expect(setInput(def, 'filter-1', 'in', '')).toMatchObject({ ok: true });
  });
  it('replacing an input of Append keeps the port numbers', () => {
    const { def } = build(['input_file', 'input_file', 'input_file', 'append']);
    let d = setInput(def, 'append-1', 'in1', 'input_file-1:out') as { definition: FlowDefinition };
    d = setInput(d.definition, 'append-1', 'in2', 'input_file-2:out') as { definition: FlowDefinition };
    const r = setInput(d.definition, 'append-1', 'in1', 'input_file-3:out') as { definition: FlowDefinition };
    expect(r.definition.edges.map((e) => [e.source, e.targetHandle]).sort()).toEqual([['input_file-2', 'in2'], ['input_file-3', 'in1']]);
  });
  it('refuses a loop with the reason, and keeps the old input', () => {
    const { def } = build(['filter', 'column_mapping']);
    const d = link(def, 'filter-1', 'column_mapping-1', 'match');
    const r = setInput(d, 'filter-1', 'in', 'column_mapping-1:out');
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/loop/);
  });
  it('names ports for people', () => {
    expect([inputTitle('in'), inputTitle('left'), inputTitle('right'), inputTitle('in3')]).toEqual(['Input', 'Left input', 'Right input', 'Input 3']);
  });
});

describe('arrangeSteps', () => {
  const messy = () => {
    const { def, ids } = build(['input_file', 'column_mapping', 'output']);
    const linked = link(link(def, ids[0]!, ids[1]!), ids[1]!, ids[2]!);
    return { def: { ...linked, nodes: linked.nodes.map((n, i) => ({ ...n, position: { x: 400 - i * 90, y: i * 300 } })) }, ids };
  };
  it('puts a messy chain in one row, 80 px between the columns, and says it changed', () => {
    const { def, ids } = messy();
    const r = arrangeSteps(def, []);
    expect(r.unchanged).toBe(false);
    const x = ids.map((id) => r.definition.nodes.find((n) => n.id === id)?.position?.x);
    expect(x).toEqual([0, 320, 640]);
  });
  it('is unchanged the second time and returns the same object', () => {
    const { def } = messy();
    const once = arrangeSteps(def, []).definition;
    const twice = arrangeSteps(once, []);
    expect(twice.unchanged).toBe(true);
    expect(twice.definition).toBe(once);
  });
  it('moves only the selected steps and puts every position back with restorePositions', () => {
    const { def, ids } = messy();
    const r = arrangeSteps(def, [ids[0]!, ids[1]!]);
    expect(r.definition.nodes.find((n) => n.id === ids[2])?.position).toEqual(def.nodes[2]?.position);
    expect(restorePositions(r.definition, r.previous)).toEqual(def);
  });
});
