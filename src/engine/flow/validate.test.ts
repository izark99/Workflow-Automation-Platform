import { describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION, flowJsonSchema, NODE_PORTS, NODE_TYPES } from './types';
import { resolveEdgeHandles, topologicalOrder, validateFlow } from './validate';

function node(id: string, type: string, settings: Record<string, unknown> = {}) {
  return { id, type, settings };
}

function flow(nodes: unknown[], edges: unknown[] = []) {
  return { schemaVersion: FLOW_SCHEMA_VERSION, nodes, edges };
}

function codes(input: unknown): string[] {
  const r = validateFlow(input);
  return r.ok ? [] : r.errors.map((e) => e.code);
}

describe('validateFlow: envelope', () => {
  it('accepts a minimal valid flow', () => {
    const r = validateFlow(
      flow(
        [node('a', 'input_file'), node('b', 'column_mapping'), node('c', 'output')],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
        ],
      ),
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a value that is not an object', () => {
    for (const bad of [null, 'x', 3, [], undefined]) {
      expect(codes(bad)).toEqual(['invalid_shape']);
    }
  });

  it('rejects a missing or unsupported schema version and says which versions work', () => {
    const r = validateFlow({ nodes: [], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe('unsupported_schema_version');
      expect(r.errors[0]?.message).toContain(String(FLOW_SCHEMA_VERSION));
    }
    expect(codes({ schemaVersion: 99, nodes: [], edges: [] })).toContain('unsupported_schema_version');
  });

  it('requires nodes and edges to be arrays', () => {
    expect(codes({ schemaVersion: FLOW_SCHEMA_VERSION, nodes: {}, edges: [] })).toContain('invalid_shape');
    expect(codes({ schemaVersion: FLOW_SCHEMA_VERSION, nodes: [], edges: 'x' })).toContain('invalid_shape');
  });

  it('rejects a node without an id, with an empty id, or without settings', () => {
    expect(codes(flow([{ type: 'input_file', settings: {} }]))).toContain('invalid_shape');
    expect(codes(flow([node('', 'input_file')]))).toContain('invalid_shape');
    expect(codes(flow([{ id: 'a', type: 'input_file' }]))).toContain('invalid_shape');
    expect(codes(flow([{ id: 'a', type: 'input_file', settings: [] }]))).toContain('invalid_shape');
  });

  it('rejects duplicate node ids and names the id', () => {
    const r = validateFlow(flow([node('a', 'input_file'), node('a', 'input_file')]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.code === 'duplicate_node_id');
      expect(e?.nodeId).toBe('a');
      expect(e?.message).toContain('"a"');
    }
  });
});

describe('validateFlow: node types and edges', () => {
  it('rejects an unknown node type and lists the known types', () => {
    const r = validateFlow(flow([node('a', 'teleport')]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.code === 'unknown_node_type');
      expect(e?.nodeId).toBe('a');
      expect(e?.message).toContain('teleport');
      expect(e?.message).toContain('input_file');
    }
  });

  it('rejects an edge to a node that does not exist', () => {
    expect(codes(flow([node('a', 'input_file')], [{ source: 'a', target: 'ghost' }]))).toContain('unknown_node');
    expect(codes(flow([node('a', 'output')], [{ source: 'ghost', target: 'a' }]))).toContain('unknown_node');
  });

  it('rejects a handle the node type does not have', () => {
    const nodes = [node('a', 'input_file'), node('b', 'output')];
    expect(codes(flow(nodes, [{ source: 'a', sourceHandle: 'nope', target: 'b' }]))).toContain('unknown_handle');
    expect(codes(flow(nodes, [{ source: 'a', target: 'b', targetHandle: 'nope' }]))).toContain('unknown_handle');
  });

  it('rejects an edge that leaves a node without outputs', () => {
    const nodes = [node('o', 'output'), node('b', 'output')];
    expect(codes(flow(nodes, [{ source: 'o', target: 'b' }]))).toContain('unknown_handle');
  });

  it('reports a node with a missing required input', () => {
    const r = validateFlow(flow([node('a', 'input_file'), node('f', 'filter')]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.code === 'missing_input');
      expect(e?.nodeId).toBe('f');
      expect(e?.message).toContain('"in"');
    }
  });

  it('lets an input node have no incoming edge', () => {
    expect(validateFlow(flow([node('a', 'input_file')])).ok).toBe(true);
  });

  it('rejects two edges into the same input handle', () => {
    const nodes = [node('a', 'input_file'), node('b', 'input_file'), node('f', 'filter')];
    const edges = [
      { source: 'a', target: 'f' },
      { source: 'b', target: 'f' },
    ];
    expect(codes(flow(nodes, edges))).toContain('input_connected_twice');
  });

  it('uses the first output when an edge names no source handle and the filter handles when named', () => {
    const nodes = [node('a', 'input_file'), node('f', 'filter'), node('x', 'output'), node('y', 'output')];
    const edges = [
      { source: 'a', target: 'f' },
      { source: 'f', sourceHandle: 'match', target: 'x' },
      { source: 'f', sourceHandle: 'nomatch', target: 'y' },
    ];
    expect(validateFlow(flow(nodes, edges)).ok).toBe(true);
  });

  it('requires lookup left input, makes the right input optional', () => {
    const base = [node('a', 'input_file'), node('l', 'lookup_join')];
    expect(codes(flow(base))).toContain('missing_input');
    expect(validateFlow(flow(base, [{ source: 'a', target: 'l', targetHandle: 'left' }])).ok).toBe(true);
  });

  it('requires at least two connected inputs on append, numbered in1, in2, ...', () => {
    const nodes = [node('a', 'input_file'), node('b', 'input_file'), node('p', 'append')];
    expect(codes(flow(nodes, [{ source: 'a', target: 'p', targetHandle: 'in1' }]))).toContain('missing_input');
    const ok = [
      { source: 'a', target: 'p', targetHandle: 'in1' },
      { source: 'b', target: 'p', targetHandle: 'in2' },
    ];
    expect(validateFlow(flow(nodes, ok)).ok).toBe(true);
  });

  it('rejects a gap in numbered inputs of a variadic node', () => {
    const nodes = [node('a', 'input_file'), node('b', 'input_file'), node('p', 'append')];
    const gap = [
      { source: 'a', target: 'p', targetHandle: 'in1' },
      { source: 'b', target: 'p', targetHandle: 'in3' },
    ];
    expect(codes(flow(nodes, gap))).toContain('missing_input');
  });

  it('requires at least one input on the sql node', () => {
    expect(codes(flow([node('s', 'sql')]))).toContain('missing_input');
  });
});

describe('cycles and order', () => {
  const cyc = flow(
    [node('a', 'filter'), node('b', 'column_mapping'), node('c', 'formula_column')],
    [
      { source: 'a', sourceHandle: 'match', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ],
  );

  it('detects a cycle and names the nodes on it in order', () => {
    const r = validateFlow(cyc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.code === 'cycle');
      expect(e).toBeDefined();
      expect(e?.message).toContain('a');
      expect(e?.message).toContain('b');
      expect(e?.message).toContain('c');
      expect(e?.message).toMatch(/->/);
    }
  });

  it('detects a node that feeds itself', () => {
    const r = codes(flow([node('a', 'column_mapping')], [{ source: 'a', target: 'a' }]));
    expect(r).toContain('cycle');
  });

  it('returns nodes in dependency order and keeps array order among independent nodes', () => {
    const f = flow(
      [node('out', 'output'), node('m', 'column_mapping'), node('i2', 'input_file'), node('i1', 'input_file')],
      [
        { source: 'i1', target: 'm' },
        { source: 'm', target: 'out' },
      ],
    );
    const r = validateFlow(f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(topologicalOrder(r.flow)).toEqual(['i2', 'i1', 'm', 'out']);
    }
  });

  it('puts every node after all of its sources', () => {
    const f = flow(
      [node('z', 'append'), node('a', 'input_file'), node('b', 'input_file')],
      [
        { source: 'b', target: 'z', targetHandle: 'in2' },
        { source: 'a', target: 'z', targetHandle: 'in1' },
      ],
    );
    const r = validateFlow(f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const order = topologicalOrder(r.flow);
      expect(order.indexOf('z')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('z')).toBeGreaterThan(order.indexOf('b'));
    }
  });
});

describe('resolveEdgeHandles', () => {
  it('fills in default handles and keeps named ones', () => {
    const r = validateFlow(
      flow(
        [node('a', 'input_file'), node('f', 'filter'), node('l', 'lookup_join')],
        [
          { source: 'a', target: 'f' },
          { source: 'f', sourceHandle: 'nomatch', target: 'l', targetHandle: 'left' },
        ],
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const edges = resolveEdgeHandles(r.flow);
      expect(edges[0]).toMatchObject({ source: 'a', sourceHandle: 'out', target: 'f', targetHandle: 'in' });
      expect(edges[1]).toMatchObject({ source: 'f', sourceHandle: 'nomatch', target: 'l', targetHandle: 'left' });
    }
  });
});

describe('port registry and JSON schema', () => {
  it('has ports for every node type of the catalog', () => {
    expect([...NODE_TYPES].sort()).toEqual(
      [
        'append',
        'column_mapping',
        'filter',
        'formula_column',
        'group_by',
        'input_file',
        'lookup_join',
        'output',
        'pivot',
        'sql',
        'unpivot',
      ].sort(),
    );
    for (const t of NODE_TYPES) expect(NODE_PORTS[t]).toBeDefined();
  });

  it('lists every node type in the JSON schema', () => {
    const s = JSON.parse(JSON.stringify(flowJsonSchema)) as {
      properties: { nodes: { items: { properties: { type: { enum: string[] } } } } };
    };
    expect([...s.properties.nodes.items.properties.type.enum].sort()).toEqual([...NODE_TYPES].sort());
  });
});

describe('error messages', () => {
  it('say what failed and what to do next', () => {
    const r = validateFlow(flow([node('a', 'teleport'), node('f', 'filter')]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      for (const e of r.errors) {
        expect(e.message.length).toBeGreaterThan(20);
        expect(e.message).toMatch(/Connect|Use|Remove|Rename|Choose|Change|Add|Fix/);
      }
    }
  });
});
