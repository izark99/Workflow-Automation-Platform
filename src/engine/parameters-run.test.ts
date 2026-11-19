import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowParameter, ParameterValue } from './flow/parameters';
import { resolveParameterValues } from './flow/parameter-values';
import { compileFormula } from './formula/compile';
import { FormulaError } from './formula/parse';
import { defaultRegistry } from './nodes/registry';
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

const table: TableData = {
  columns: [
    { name: 'n', type: 'number' },
    { name: 'Name', type: 'text' },
    { name: 'day', type: 'date' },
    { name: 'on', type: 'boolean' },
  ],
  rows: [
    [1, 'Ann', '2026-09-01', true],
    [2, 'Bob', '2026-09-15', false],
    [3, 'Cy', '2026-09-30', true],
  ],
};

const source: NodeModule = {
  type: 'input_file',
  compile: ({ node, inputTables }) => {
    const t = inputTables[String(node.settings.key)]!;
    return { out: { sql: `SELECT * FROM ${quoteIdent(t.relation)}`, columns: t.columns } };
  },
};
const registry = { ...defaultRegistry, input_file: source };

const p = (over: Partial<FlowParameter> & Pick<FlowParameter, 'key' | 'type'>): FlowParameter => ({ label: over.key, required: true, ...over });
const DATE = p({ key: 'cutoff', type: 'date' });
const TEXT = p({ key: 'who', type: 'text' });
const NUM = p({ key: 'min_n', type: 'number' });
const LIST = p({ key: 'team', type: 'list', options: ['A', 'B'] });
const BOOL = p({ key: 'flag', type: 'boolean' });

const flow = (parameters: FlowParameter[], middle: { type: string; settings: Record<string, unknown> }) => ({
  schemaVersion: 2,
  parameters,
  nodes: [
    { id: 'in', type: 'input_file', settings: { key: 'Main' } },
    { id: 'mid', ...middle },
    { id: 'out', type: 'output', settings: { file: 'Result', format: 'xlsx', sheet: 'Data' } },
  ],
  edges: [
    { source: 'in', target: 'mid' },
    { source: 'mid', target: 'out' },
  ],
});
const filterFlow = (parameters: FlowParameter[], condition: string) => flow(parameters, { type: 'filter', settings: { condition } });

async function names(parameters: FlowParameter[], condition: string, values: Record<string, ParameterValue | null>): Promise<unknown[]> {
  const r = await runFlow(runner, { flow: filterFlow(parameters, condition), effectiveDate: '2026-09-30', inputs: { Main: table }, registry, parameterValues: values });
  try {
    return (await r.rows('out')).rows.map((row) => row[1]);
  } finally {
    await r.dispose();
  }
}

async function failure(run: () => Promise<unknown>): Promise<EngineError> {
  try {
    await run();
  } catch (e) {
    if (e instanceof EngineError) return e;
    throw e;
  }
  throw new Error('expected the run to fail');
}

describe('resolveParameterValues', () => {
  it('returns each value by key and keeps a blank optional value as null', () => {
    const optional = p({ key: 'opt', type: 'text', required: false });
    const r = resolveParameterValues([DATE, optional], { cutoff: '2026-09-15' });
    expect(r.cutoff).toEqual({ type: 'date', value: '2026-09-15' });
    expect(r.opt).toEqual({ type: 'text', value: null });
  });

  it('refuses a missing required value, naming the parameter, before anything runs', () => {
    const e = (() => {
      try {
        resolveParameterValues([DATE], {});
      } catch (x) {
        return x as EngineError;
      }
    })();
    expect(e?.messageId).toBe('engine.paramMissing');
    expect(e?.message).toMatch(/cutoff/); // the label of DATE is its key in this test
    expect(e?.params).toEqual({ key: 'cutoff', label: 'cutoff' });
  });

  it('treats null and empty text as missing', () => {
    expect(() => resolveParameterValues([TEXT], { who: null })).toThrow(/who/);
    expect(() => resolveParameterValues([TEXT], { who: '' })).toThrow(/who/);
  });

  it('refuses a value of the wrong type for every type', () => {
    const bad: [FlowParameter, ParameterValue][] = [
      [DATE, '30/09/2026'],
      [DATE, 5],
      [TEXT, 5],
      [NUM, '5'],
      [NUM, Number.NaN],
      [BOOL, 'true'],
    ];
    for (const [param, value] of bad) {
      expect(() => resolveParameterValues([param], { [param.key]: value }), `${param.type} ${String(value)}`).toThrow(/\b/);
      try {
        resolveParameterValues([param], { [param.key]: value });
      } catch (e) {
        expect((e as EngineError).messageId).toBe('engine.paramWrongType');
        expect((e as EngineError).message).toContain(param.label);
      }
    }
  });

  it('refuses a list value that is not an option, and lists the options', () => {
    try {
      resolveParameterValues([LIST], { team: 'C' });
      throw new Error('should fail');
    } catch (e) {
      expect((e as EngineError).messageId).toBe('engine.paramNotOption');
      expect((e as EngineError).message).toMatch(/A, B/);
    }
  });

  it('accepts a good value of every type', () => {
    const r = resolveParameterValues([DATE, TEXT, NUM, LIST, BOOL], { cutoff: '2026-09-15', who: 'x', min_n: 0, team: 'B', flag: false });
    expect(Object.keys(r)).toEqual(['cutoff', 'who', 'min_n', 'team', 'flag']);
    expect(r.flag?.value).toBe(false);
    expect(r.min_n?.value).toBe(0);
  });
});

describe('PARAM in a formula', () => {
  const env = (parameters: Record<string, { type: FlowParameter['type']; value: ParameterValue | null }>) => ({ columns: table.columns, effectiveDate: '2026-09-30', parameters });

  it('has the type of the parameter', () => {
    const e = env({
      d: { type: 'date', value: '2026-09-15' },
      t: { type: 'text', value: 'x' },
      n: { type: 'number', value: 2 },
      l: { type: 'list', value: 'A' },
      b: { type: 'boolean', value: true },
    });
    expect(compileFormula('PARAM("d")', e).type).toBe('date');
    expect(compileFormula('PARAM("t")', e).type).toBe('text');
    expect(compileFormula('PARAM("n")', e).type).toBe('number');
    expect(compileFormula('PARAM("l")', e).type).toBe('text');
    expect(compileFormula('PARAM("b")', e).type).toBe('boolean');
  });

  it('refuses an unknown key and names it', () => {
    const e = env({ d: { type: 'date', value: '2026-09-15' } });
    expect(() => compileFormula('PARAM("nope")', e)).toThrow(FormulaError);
    expect(() => compileFormula('PARAM("nope")', e)).toThrow(/nope/);
    expect(() => compileFormula('PARAM("nope")', { columns: [], effectiveDate: '2026-09-30' })).toThrow(/no parameters|nope/);
  });

  it('needs one text key written in the formula', () => {
    const e = env({ d: { type: 'date', value: '2026-09-15' } });
    expect(() => compileFormula('PARAM()', e)).toThrow(/key/);
    expect(() => compileFormula('PARAM([n])', e)).toThrow(/key/);
    expect(() => compileFormula('PARAM("d", "e")', e)).toThrow(/key/);
  });

  it('finds the key without regard to case', () => {
    const e = env({ Cutoff: { type: 'date', value: '2026-09-15' } });
    expect(compileFormula('PARAM("cutoff")', e).type).toBe('date');
  });
});

describe('a run with parameters', () => {
  it('filters on a date parameter', async () => {
    expect(await names([DATE], '[day] <= PARAM("cutoff")', { cutoff: '2026-09-15' })).toEqual(['Ann', 'Bob']);
    expect(await names([DATE], '[day] <= PARAM("cutoff")', { cutoff: '2026-09-30' })).toEqual(['Ann', 'Bob', 'Cy']);
  });
  it('filters on a text parameter, ignoring case', async () => {
    expect(await names([TEXT], '[Name] = PARAM("who")', { who: 'bob' })).toEqual(['Bob']);
  });
  it('filters on a number parameter', async () => {
    expect(await names([NUM], '[n] >= PARAM("min_n")', { min_n: 2 })).toEqual(['Bob', 'Cy']);
  });
  it('filters on a list parameter', async () => {
    expect(await names([LIST], 'PARAM("team") = "B"', { team: 'B' })).toEqual(['Ann', 'Bob', 'Cy']);
    expect(await names([LIST], 'PARAM("team") = "B"', { team: 'A' })).toEqual([]);
  });
  it('filters on a boolean parameter', async () => {
    expect(await names([BOOL], '[on] = PARAM("flag")', { flag: true })).toEqual(['Ann', 'Cy']);
  });
  it('a text value with quotes is a value, not SQL', async () => {
    expect(await names([TEXT], '[Name] = PARAM("who")', { who: "x' OR 1=1 --" })).toEqual([]);
  });

  it('refuses a bad value before any step runs', async () => {
    const steps: string[] = [];
    const e = await failure(() =>
      runFlow(runner, {
        flow: filterFlow([DATE], '[day] <= PARAM("cutoff")'),
        effectiveDate: '2026-09-30',
        inputs: { Main: table },
        registry,
        parameterValues: { cutoff: 'soon' },
        onNode: (ev) => steps.push(ev.nodeId),
      }),
    );
    expect(e.messageId).toBe('engine.paramWrongType');
    expect(steps).toEqual([]);
  });

  it('refuses a missing required value, and runs when an optional one is blank', async () => {
    const e = await failure(() => names([DATE], '[day] <= PARAM("cutoff")', {}));
    expect(e.messageId).toBe('engine.paramMissing');
    const optional = p({ key: 'cutoff', type: 'date', required: false });
    expect(await names([optional], '[day] <= PARAM("cutoff")', {})).toEqual([]);
  });

  it('names an unknown key as an error of the step', async () => {
    const e = await failure(() => names([DATE], '[day] <= PARAM("other")', { cutoff: '2026-09-15' }));
    expect(e.code).toBe('invalid_formula');
    expect(e.message).toMatch(/other/);
    expect(e.nodeId).toBe('mid');
  });

  it('a flow without parameters runs as before', async () => {
    const r = await runFlow(runner, { flow: { ...filterFlow([], '[n] > 1'), schemaVersion: 1, parameters: undefined }, effectiveDate: '2026-09-30', inputs: { Main: table }, registry });
    try {
      expect((await r.rows('out')).rows).toHaveLength(2);
    } finally {
      await r.dispose();
    }
  });
});

describe('PARAM in a formula column and a sort', () => {
  it('works in a Formula column step', async () => {
    const f = flow([NUM], { type: 'formula_column', settings: { name: 'Plus', expression: '[n] + PARAM("min_n")' } });
    const r = await runFlow(runner, { flow: f, effectiveDate: '2026-09-30', inputs: { Main: table }, registry, parameterValues: { min_n: 10 } });
    try {
      expect((await r.rows('out')).rows.map((row) => row[4])).toEqual([11, 12, 13]);
    } finally {
      await r.dispose();
    }
  });
});

describe('the params table of the SQL step', () => {
  const sqlFlow = (parameters: FlowParameter[], sql: string) => flow(parameters, { type: 'sql', settings: { sql } });
  const run = async (f: unknown, values: Record<string, ParameterValue | null>) => {
    const r = await runFlow(runner, { flow: f, effectiveDate: '2026-09-30', inputs: { Main: table }, registry, parameterValues: values });
    try {
      return (await r.rows('out')).rows;
    } finally {
      await r.dispose();
    }
  };

  it('has one row with a column per parameter, typed', async () => {
    const f = sqlFlow([DATE, TEXT, NUM, LIST, BOOL], 'SELECT cutoff, who, min_n, team, flag FROM params');
    const rows = await run(f, { cutoff: '2026-09-15', who: 'Bob', min_n: 2, team: 'B', flag: true });
    expect(rows).toEqual([['2026-09-15', 'Bob', 2, 'B', true]]);
  });

  it('can be joined to an input', async () => {
    const f = sqlFlow([DATE], 'SELECT "Name" FROM in1, params WHERE in1."day" <= params.cutoff ORDER BY 1');
    expect(await run(f, { cutoff: '2026-09-15' })).toEqual([['Ann'], ['Bob']]);
  });

  it('says what to do when the flow has no parameters', async () => {
    const e = await failure(() => run(sqlFlow([], 'SELECT * FROM params'), {}));
    expect(e.message).toMatch(/params/);
    expect(e.message).toMatch(/parameter/i);
    expect(e.nodeId).toBe('mid');
  });

  it('still refuses what the SQL step refused before', async () => {
    const e = await failure(() => run(sqlFlow([DATE], 'SELECT * FROM read_csv(\'x\'), params'), { cutoff: '2026-09-15' }));
    expect(e.message).toMatch(/read_csv/);
  });
});

describe('messages name the label that the user sees, not the key', () => {
  const labelled = p({ key: 'cutoff', type: 'date', label: 'Cut-off date' });
  it('for a missing value, a wrong type and a list value that is not an option', () => {
    expect(() => resolveParameterValues([labelled], {})).toThrow(/"Cut-off date" needs a value/);
    expect(() => resolveParameterValues([labelled], { cutoff: 'soon' })).toThrow(/"Cut-off date" is not a valid date/);
    expect(() => resolveParameterValues([p({ key: 'team', type: 'list', label: 'Team', options: ['A'] })], { team: 'Z' })).toThrow(/"Team" is not one of its options \(A\)/);
  });
});
