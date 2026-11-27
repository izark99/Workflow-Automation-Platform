import { describe, expect, it } from 'vitest';
import { NODE_PORTS, NODE_TYPES } from '../../engine/flow/types';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { validateFlow } from '../../engine/flow/validate';
import { addStepAfter, firstRequiredInput, freeOutput, insertStepOnEdge } from './add-after';
import { addStep, connectSteps, emptyDefinition, resolvedEdges } from './graph';

const withStep = (type: NodeType, def: FlowDefinition = emptyDefinition(), at = { x: 100, y: 100 }) => {
  const r = addStep(def, type, at);
  return { def: r.definition, id: r.id };
};
const link = (def: FlowDefinition, source: string, target: string, sourceHandle: string | null = null, targetHandle: string | null = null): FlowDefinition => {
  const r = connectSteps(def, { source, sourceHandle, target, targetHandle });
  if (!r.ok) throw new Error(r.reason);
  return r.definition;
};

const hasOutput = (t: NodeType) => (['output'] as NodeType[]).indexOf(t) < 0;

describe('addStepAfter: every type as the new step', () => {
  for (const type of NODE_TYPES) {
    it(`${type}: placed to the right, connected only when it has an input`, () => {
      const { def, id } = withStep('input_file');
      const r = addStepAfter(def, [id], type);
      const added = r.definition.nodes.find((n) => n.id === r.id);
      expect(added?.position).toEqual({ x: 100 + 240 + 80, y: 100 });
      const edges = resolvedEdges(r.definition);
      const into = firstRequiredInput(type);
      if (into) {
        expect(edges).toHaveLength(1);
        expect(edges[0]).toMatchObject({ source: id, sourceHandle: 'out', target: r.id, targetHandle: into });
        expect(r.connectedTo?.id).toBe(id);
      } else {
        expect(edges).toHaveLength(0);
        expect(r.connectedTo).toBeUndefined();
      }
    });
  }
  it('uses the left input of a Lookup and in1 of an Append', () => {
    const { def, id } = withStep('input_file');
    expect(resolvedEdges(addStepAfter(def, [id], 'lookup_join').definition)[0]?.targetHandle).toBe('left');
    expect(resolvedEdges(addStepAfter(def, [id], 'append').definition)[0]?.targetHandle).toBe('in1');
  });
});

describe('addStepAfter: every type as the selected step', () => {
  for (const type of NODE_TYPES) {
    it(`${type} selected`, () => {
      const { def, id } = withStep(type);
      const r = addStepAfter(def, [id], 'column_mapping');
      if (hasOutput(type)) {
        expect(resolvedEdges(r.definition)).toHaveLength(1);
        expect(resolvedEdges(r.definition)[0]?.sourceHandle).toBe(NODE_PORTS[type].outputs[0]);
      } else {
        // Output has no output: the step is added below, nothing is connected.
        expect(resolvedEdges(r.definition)).toHaveLength(0);
        expect(r.definition.nodes.find((n) => n.id === r.id)?.position).toEqual({ x: 100, y: 100 + 56 + 40 });
      }
    });
  }
  it('a Filter gives match first, then nomatch, then nothing', () => {
    let { def } = withStep('filter');
    const f = def.nodes[0]!.id;
    const a = addStepAfter(def, [f], 'column_mapping');
    def = a.definition;
    expect(resolvedEdges(def)[0]?.sourceHandle).toBe('match');
    const b = addStepAfter(def, [f], 'column_mapping');
    expect(resolvedEdges(b.definition).map((e) => e.sourceHandle)).toEqual(['match', 'nomatch']);
    const c = addStepAfter(b.definition, [f], 'column_mapping');
    expect(resolvedEdges(c.definition)).toHaveLength(2);
    expect(freeOutput(c.definition, c.definition.nodes[0]!)).toBeUndefined();
  });
  it('a step whose output is taken gets the new step below, unconnected', () => {
    const { def, id } = withStep('input_file');
    const first = addStepAfter(def, [id], 'column_mapping');
    const second = addStepAfter(first.definition, [id], 'column_mapping');
    expect(resolvedEdges(second.definition)).toHaveLength(1);
  });
});

describe('addStepAfter: selection and place', () => {
  it('adds below the lowest step with no selection or with several selected', () => {
    const first = withStep('input_file');
    const id = first.id;
    let def = first.def;
    const two = withStep('input_file', def, { x: 500, y: 300 });
    def = two.def;
    for (const sel of [[], [id, two.id]]) {
      const r = addStepAfter(def, sel, 'column_mapping');
      expect(resolvedEdges(r.definition)).toHaveLength(0);
      expect(r.definition.nodes.find((n) => n.id === r.id)?.position).toEqual({ x: 500, y: 300 + 56 + 40 });
    }
  });
  it('takes the first free place going down when the place to the right is taken', () => {
    const { def, id } = withStep('input_file');
    const taken = addStep(def, 'column_mapping', { x: 420, y: 100 }).definition;
    const r = addStepAfter(taken, [id], 'filter');
    expect(r.definition.nodes.find((n) => n.id === r.id)?.position).toEqual({ x: 420, y: 100 + 56 + 40 });
  });
  it('a flow built only by adding after the selected step is valid', () => {
    let def = emptyDefinition();
    let sel: string[] = [];
    for (const type of ['input_file', 'column_mapping', 'filter', 'formula_column', 'output'] as NodeType[]) {
      const r = addStepAfter(def, sel, type);
      def = r.definition;
      sel = [r.id];
    }
    expect(resolvedEdges(def)).toHaveLength(4);
    const v = validateFlow(def);
    expect(v.ok ? [] : v.errors.map((e) => e.message)).toEqual([]);
  });
});

describe('insertStepOnEdge', () => {
  const chain = () => {
    const a = withStep('input_file');
    const b = withStep('output', a.def, { x: 600, y: 100 });
    return { def: link(b.def, a.id, b.id), a: a.id, b: b.id };
  };
  it('splits the edge into source to new step to target', () => {
    const { def, a, b } = chain();
    const id = resolvedEdges(def)[0]!.id;
    const r = insertStepOnEdge(def, id, 'column_mapping', { x: 300, y: 100 })!;
    const edges = resolvedEdges(r.definition);
    expect(edges.map((e) => [e.source, e.target])).toEqual([[a, r.id], [r.id, b]]);
  });
  it('keeps the handles of the old edge (a Filter output, an Append input)', () => {
    const filterStep = withStep('filter');
    let def = filterStep.def;
    const f = filterStep.id;
    const ap = withStep('append', def, { x: 700, y: 0 });
    def = link(ap.def, f, ap.id, 'nomatch', 'in2');
    const r = insertStepOnEdge(def, resolvedEdges(def)[0]!.id, 'formula_column', { x: 300, y: 0 })!;
    const edges = resolvedEdges(r.definition);
    expect(edges[0]).toMatchObject({ source: f, sourceHandle: 'nomatch', target: r.id, targetHandle: 'in' });
    expect(edges[1]).toMatchObject({ source: r.id, target: ap.id, targetHandle: 'in2' });
  });
  it('refuses a step with no input, no output or a second required input', () => {
    const { def } = chain();
    const id = resolvedEdges(def)[0]!.id;
    for (const t of ['input_file', 'reference_table', 'output', 'append'] as NodeType[]) expect(insertStepOnEdge(def, id, t, { x: 0, y: 0 })).toBeNull();
  });
  it('a Lookup with one required input can be inserted, and an unknown edge gives null', () => {
    const { def } = chain();
    expect(insertStepOnEdge(def, resolvedEdges(def)[0]!.id, 'lookup_join', { x: 0, y: 0 })).not.toBeNull();
    expect(insertStepOnEdge(def, 'nope', 'column_mapping', { x: 0, y: 0 })).toBeNull();
  });
});
