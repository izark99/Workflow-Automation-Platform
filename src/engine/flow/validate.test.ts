import { describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION, flowJsonSchema, NEW_STEP_TYPES, NODE_PORTS, NODE_TYPES } from './types';
import { withPrintVersion, withStepsVersion } from './steps-version';
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
        'reference_table',
        'sql',
        'unpivot',
        'sort',
        'dedupe',
        'top_n',
        'split_column',
        'clean_text',
        'check',
        'compare',
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

describe('the seven steps of Phase 8 (schemaVersion 4)', () => {
  it('has the ports of SPEC 15.4', () => {
    expect(NODE_PORTS.dedupe.outputs).toEqual(['kept', 'removed']);
    expect(NODE_PORTS.check.outputs).toEqual(['ok', 'errors']);
    expect(NODE_PORTS.compare.outputs).toEqual(['added', 'removed', 'changed']);
    expect(NODE_PORTS.compare.inputs).toEqual({ kind: 'fixed', handles: [{ name: 'new', required: true }, { name: 'old', required: true }] });
    for (const t of ['sort', 'top_n', 'split_column', 'clean_text'] as const) expect(NODE_PORTS[t].outputs).toEqual(['out']);
    expect([...NEW_STEP_TYPES].sort()).toEqual(['check', 'clean_text', 'compare', 'dedupe', 'sort', 'split_column', 'top_n']);
  });

  it('accepts each new step in a version 4 flow and routes edges through their handles', () => {
    for (const t of NEW_STEP_TYPES) {
      const inputs = t === 'compare' ? [node('i', 'input_file'), node('j', 'input_file')] : [node('i', 'input_file')];
      const edges = t === 'compare' ? [{ source: 'i', target: 'n', targetHandle: 'new' }, { source: 'j', target: 'n', targetHandle: 'old' }] : [{ source: 'i', target: 'n' }];
      expect(validateFlow(flow([...inputs, node('n', t)], edges)).ok, t).toBe(true);
    }
    const r = validateFlow(flow([node('i', 'input_file'), node('d', 'dedupe'), node('o', 'output')], [{ source: 'i', target: 'd' }, { source: 'd', sourceHandle: 'removed', target: 'o' }]));
    expect(r.ok).toBe(true);
  });

  it('refuses an output handle that the step does not have, and a Compare with one input missing', () => {
    expect(codes(flow([node('i', 'input_file'), node('c', 'check'), node('o', 'output')], [{ source: 'i', target: 'c' }, { source: 'c', sourceHandle: 'match', target: 'o' }]))).not.toEqual([]);
    expect(codes(flow([node('i', 'input_file'), node('n', 'compare')], [{ source: 'i', target: 'n', targetHandle: 'new' }]))).toContain('missing_input');
  });

  it('refuses a new step in a definition below version 4 and says to set schemaVersion 4', () => {
    for (const v of [1, 2, 3]) {
      const r = validateFlow({ schemaVersion: v, nodes: [node('i', 'input_file'), node('s', 'sort')], edges: [{ source: 'i', target: 's' }] });
      expect(r.ok, `v${v}`).toBe(false);
      expect(!r.ok && r.errors.some((e) => e.nodeId === 's' && /schemaVersion 4/.test(e.message))).toBe(true);
    }
  });

  it('older definitions load unchanged, and a version 4 flow may hold bindings', () => {
    expect(validateFlow({ schemaVersion: 1, nodes: [node('i', 'input_file')], edges: [] }).ok).toBe(true);
    const bound = validateFlow({ schemaVersion: 4, parameters: [{ key: 'p', label: 'P', type: 'number', required: true }], nodes: [node('i', 'input_file'), node('t', 'top_n', { n: { $param: 'p' } })], edges: [{ source: 'i', target: 't' }] });
    expect(bound.ok).toBe(true);
  });
});

describe('withStepsVersion', () => {
  const def = (version: 1 | 2 | 3 | 4, types: string[]) => ({ schemaVersion: version, nodes: types.map((t, i) => ({ id: `n${i}`, type: t as never, settings: {} })), edges: [] });
  it('makes a definition with a new step version 4, and leaves every other definition as it is', () => {
    expect(withStepsVersion(def(1, ['input_file', 'sort'])).schemaVersion).toBe(4);
    const plain = def(1, ['input_file', 'output']);
    expect(withStepsVersion(plain)).toBe(plain);
  });
  it('never lowers a version: 4 stays 4 when the new step is gone', () => {
    const four = def(4, ['input_file']);
    expect(withStepsVersion(four)).toBe(four);
  });
});

describe('schemaVersion 5 and the versions before it', () => {
  const step = (type: string, settings: Record<string, unknown> = {}) => node('n', type, settings);
  it('a saved version 4 flow with a new step still validates when the latest version is 5 (a version is never lowered by a newer one)', () => {
    for (const t of NEW_STEP_TYPES) {
      const inputs = t === 'compare' ? [node('i', 'input_file'), node('j', 'input_file')] : [node('i', 'input_file')];
      const edges = t === 'compare' ? [{ source: 'i', target: 'n', targetHandle: 'new' }, { source: 'j', target: 'n', targetHandle: 'old' }] : [{ source: 'i', target: 'n' }];
      for (const v of [4, 5]) expect(validateFlow({ schemaVersion: v, nodes: [...inputs, step(t)], edges }).ok, `${t} v${v}`).toBe(true);
    }
  });
  it('withStepsVersion makes version 4 of an older definition, leaves 4 and 5 as they are', () => {
    const def = (v: 1 | 4 | 5) => ({ schemaVersion: v, nodes: [{ id: 's', type: 'sort' as const, settings: {} }], edges: [] });
    expect(withStepsVersion(def(1)).schemaVersion).toBe(4);
    const five = def(5);
    expect(withStepsVersion(five)).toBe(five);
  });
});

describe('the print layout in a definition', () => {
  const output = (print: unknown) => ({ id: 'o', type: 'output', settings: { file: 'R', format: 'xlsx', sheet: 'S', ...(print === undefined ? {} : { print }) } });
  const flowOf = (version: number, print: unknown, parameters?: unknown[]) => ({ schemaVersion: version, ...(parameters ? { parameters } : {}), nodes: [node('i', 'input_file'), output(print)], edges: [{ source: 'i', target: 'o' }] });
  const messages = (input: unknown) => {
    const r = validateFlow(input);
    return r.ok ? [] : r.errors.map((e) => e.message);
  };
  it('a print layout needs schemaVersion 5 and says so', () => {
    expect(messages(flowOf(4, { enabled: true }))[0]).toMatch(/needs schemaVersion 5/);
    expect(validateFlow(flowOf(5, { enabled: true })).ok).toBe(true);
    expect(validateFlow(flowOf(4, undefined)).ok).toBe(true);
  });
  it('names a token that does not exist and a parameter that the flow does not have, with the place', () => {
    const header = (text: string) => [{ text }];
    expect(messages(flowOf(5, { header: header('{company}') }))[0]).toMatch(/\{company\} in header line 1 is not a token/);
    expect(messages(flowOf(5, { header: header('{param:gone}') }))[0]).toMatch(/\{param:gone\} in header line 1 names the parameter "gone"/);
    expect(validateFlow(flowOf(5, { header: header('{param:period} {flow}') }, [{ key: 'period', label: 'Period', type: 'text', required: true }])).ok).toBe(true);
  });
  it('says what is wrong with the layout itself', () => {
    expect(messages(flowOf(5, { paper: 'B5' }))[0]).toMatch(/paper is "B5"/);
    expect(messages(flowOf(5, { header: Array.from({ length: 7 }, () => ({ text: 'x' })) }))[0]).toMatch(/at most 6/);
  });
  it('withPrintVersion makes version 5 when an Output step has a layout, and never lowers it', () => {
    const base = (v: 1 | 4 | 5, print?: unknown) => ({ schemaVersion: v, nodes: [{ id: 'o', type: 'output' as const, settings: print === undefined ? {} : { print } }], edges: [] });
    expect(withPrintVersion(base(1, { enabled: true })).schemaVersion).toBe(5);
    expect(withPrintVersion(base(4, { enabled: false })).schemaVersion).toBe(5);
    const plain = base(4);
    expect(withPrintVersion(plain)).toBe(plain);
    const five = base(5);
    expect(withPrintVersion(five)).toBe(five);
  });
});
