import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION } from './flow/types';
import type { NodeModule } from './nodes/types';
import { createNodeRunner } from './runner/node-runner';
import { quoteIdent } from './sql';
import { runFlow } from './run';
import { EngineError, type SqlRunner, type TableData } from './types';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const numbers = (n: number): TableData => ({
  columns: [
    { name: 'n', type: 'number' },
    { name: 'Label', type: 'text' },
    { name: 'day', type: 'date' },
  ],
  rows: Array.from({ length: n }, (_, i) => [i + 1, `row ${i + 1}`, '2026-09-30']),
});

/** Test-only input: reads the table that the engine loaded for the key in its settings. */
const source: NodeModule = {
  type: 'input_file',
  compile: ({ node, inputTables }) => {
    const t = inputTables[String(node.settings.key)];
    if (!t) throw new EngineError('missing_input_table', 'No table was provided for this input.', node.id);
    return { out: { sql: `SELECT * FROM ${quoteIdent(t.relation)}`, columns: t.columns } };
  },
};

/** Test-only pass-through that counts how often it compiles. */
function passthrough(counter: string[]): NodeModule {
  return {
    type: 'column_mapping',
    compile: ({ node, inputs }) => {
      counter.push(node.id);
      const t = inputs.in!;
      return { out: { sql: `SELECT * FROM ${quoteIdent(t.relation)}`, columns: t.columns } };
    },
  };
}

/** Test-only two-output node: rows above a threshold go to `match`, the rest to `nomatch`. */
const splitter: NodeModule = {
  type: 'filter',
  compile: ({ node, inputs }) => {
    const t = inputs.in!;
    const from = quoteIdent(t.relation);
    return {
      match: { sql: `SELECT * FROM ${from} WHERE "n" > ${Number(node.settings.above)}`, columns: t.columns },
      nomatch: { sql: `SELECT * FROM ${from} WHERE "n" <= ${Number(node.settings.above)}`, columns: t.columns },
    };
  },
};

const flowOf = (nodes: unknown[], edges: unknown[]) => ({ schemaVersion: FLOW_SCHEMA_VERSION, nodes, edges });
const n = (id: string, type: string, settings: Record<string, unknown> = {}) => ({ id, type, settings });

describe('runFlow', () => {
  it('runs a chain and previews at most 100 rows with typed cells', async () => {
    const calls: string[] = [];
    const result = await runFlow(runner, {
      flow: flowOf(
        [n('b', 'column_mapping'), n('a', 'input_file', { key: 'Main' })],
        [{ source: 'a', target: 'b' }],
      ),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(150) },
      registry: { input_file: source, column_mapping: passthrough(calls) },
    });
    try {
      const table = result.tables.get('b/out');
      expect(table?.rowCount).toBe(150);
      const preview = await result.preview('b');
      expect(preview.rows).toHaveLength(100);
      expect(preview.columns.map((c) => c.name)).toEqual(['n', 'Label', 'day']);
      expect(preview.rows[0]).toEqual([1, 'row 1', '2026-09-30']);
      const tail = await result.preview('b', 'out', 3, 97);
      expect(tail.rows.map((r) => r[0])).toEqual([98, 99, 100]);
      const small = await result.preview('b', 'out', 3);
      expect(small.rows).toHaveLength(3);
      expect(calls).toEqual(['b']);
    } finally {
      await result.dispose();
    }
  });

  it('materializes a two-output node once and feeds both consumers', async () => {
    const calls: string[] = [];
    const result = await runFlow(runner, {
      flow: flowOf(
        [n('s', 'filter', { above: 4 }), n('i', 'input_file', { key: 'Main' }), n('p1', 'column_mapping'), n('p2', 'column_mapping')],
        [
          { source: 'i', target: 's' },
          { source: 's', sourceHandle: 'match', target: 'p1' },
          { source: 's', sourceHandle: 'nomatch', target: 'p2' },
        ],
      ),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(10) },
      registry: { input_file: source, filter: splitter, column_mapping: passthrough(calls) },
    });
    try {
      expect(result.tables.get('s/match')?.rowCount).toBe(6);
      expect(result.tables.get('s/nomatch')?.rowCount).toBe(4);
      expect(result.tables.get('p1/out')?.rowCount).toBe(6);
      expect(result.tables.get('p2/out')?.rowCount).toBe(4);
      expect(calls.sort()).toEqual(['p1', 'p2']);
    } finally {
      await result.dispose();
    }
  });

  it('rejects an invalid flow with the validator messages', async () => {
    const err = await runFlow(runner, {
      flow: flowOf([n('a', 'teleport')], []),
      effectiveDate: '2026-09-30',
      registry: {},
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('invalid_flow');
    expect((err as EngineError).message).toContain('teleport');
  });

  it('stops with a clear message when a node type has no module yet', async () => {
    const err = await runFlow(runner, {
      flow: flowOf([n('a', 'input_file', { key: 'Main' })], []),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(1) },
      registry: {},
    }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('unsupported_node');
    expect((err as EngineError).nodeId).toBe('a');
  });

  it('wraps a failing query with the id of the step', async () => {
    const broken: NodeModule = {
      type: 'column_mapping',
      compile: ({ inputs }) => ({
        out: { sql: `SELECT nope FROM ${quoteIdent(inputs.in!.relation)}`, columns: inputs.in!.columns },
      }),
    };
    const err = await runFlow(runner, {
      flow: flowOf([n('a', 'input_file', { key: 'Main' }), n('b', 'column_mapping')], [{ source: 'a', target: 'b' }]),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(2) },
      registry: { input_file: source, column_mapping: broken },
    }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('node_failed');
    expect((err as EngineError).nodeId).toBe('b');
    expect((err as EngineError).message).toContain('"b"');
  });

  it('stops between steps when the signal aborts, and runs no later step', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const first: NodeModule = {
      type: 'input_file',
      compile: (ctx) => {
        controller.abort();
        return source.compile(ctx);
      },
    };
    const err = await runFlow(runner, {
      flow: flowOf([n('a', 'input_file', { key: 'Main' }), n('b', 'column_mapping')], [{ source: 'a', target: 'b' }]),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(2) },
      registry: { input_file: first, column_mapping: passthrough(calls) },
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('cancelled');
    expect(calls).toEqual([]);
  });

  it('reports progress per step', async () => {
    const events: string[] = [];
    const result = await runFlow(runner, {
      flow: flowOf([n('a', 'input_file', { key: 'Main' }), n('b', 'column_mapping')], [{ source: 'a', target: 'b' }]),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(2) },
      registry: { input_file: source, column_mapping: passthrough([]) },
      onNode: (e) => events.push(`${e.nodeId}:${e.status}`),
    });
    await result.dispose();
    expect(events).toEqual(['a:start', 'a:done', 'b:start', 'b:done']);
  });

  it('drops its tables on dispose, and two runs do not clash', async () => {
    const opts = {
      flow: flowOf([n('a', 'input_file', { key: 'Main' })], []),
      effectiveDate: '2026-09-30',
      inputs: { Main: numbers(2) },
      registry: { input_file: source },
    };
    const r1 = await runFlow(runner, opts);
    const r2 = await runFlow(runner, opts);
    expect(r1.tables.get('a/out')?.relation).not.toBe(r2.tables.get('a/out')?.relation);
    const rel = r1.tables.get('a/out')!.relation;
    await r1.dispose();
    await expect(runner.query(`SELECT * FROM ${quoteIdent(rel)}`)).rejects.toThrow();
    expect((await r2.preview('a')).rows).toHaveLength(2);
    await r2.dispose();
  });

  it('loads reference tables and hands them to the node', async () => {
    let seen = '';
    const reader: NodeModule = {
      type: 'input_file',
      compile: ({ refTables }) => {
        const t = refTables.limits!;
        seen = t.columns.map((c) => c.name).join(',');
        return { out: { sql: `SELECT * FROM ${quoteIdent(t.relation)}`, columns: t.columns } };
      },
    };
    const result = await runFlow(runner, {
      flow: flowOf([n('a', 'input_file', { key: 'Unused' })], []),
      effectiveDate: '2026-09-30',
      refTables: { limits: { columns: [{ name: 'period', type: 'text' }, { name: 'limit_hours', type: 'number' }], rows: [['WEEK', 16]] } },
      registry: { input_file: reader },
    });
    expect(seen).toBe('period,limit_hours');
    expect((await result.preview('a')).rows).toEqual([['WEEK', 16]]);
    await result.dispose();
  });
});
