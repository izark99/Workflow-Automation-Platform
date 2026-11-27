import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLOW_SCHEMA_VERSION } from '../flow/types';
import { runFlow } from '../run';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { parseCheckSettings } from './check';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const input: TableData = {
  columns: [
    { name: 'Id', type: 'text' },
    { name: 'Hours', type: 'number' },
    { name: 'Dept', type: 'text' },
  ],
  rows: [
    ['1', 8, 'A'],
    ['2', 30, 'B'],
    ['3', null, 'A'],
    ['4', -2, null],
    ['5', 40, null],
    ['6', 6, 'C'],
  ],
};

const rules = [
  { name: 'Hours range', condition: 'AND([Hours] >= 0, [Hours] <= 24)', message: 'Hours must be from 0 to 24.' },
  { name: 'Department', condition: 'NOT(ISBLANK([Dept]))', message: 'A department is required.' },
];

const check = (settings: Record<string, unknown>, handle: 'ok' | 'errors', data = input) => runNode(runner, 'check', { settings, inputs: { in: data }, handle });
const ids = (t: TableData) => t.rows.map((r) => r[0]);

describe('check node', () => {
  it('ok holds the rows that pass every rule, in the order of the input', async () => {
    // Row 3 has no hours, which counts as 0 in a comparison, so it passes the range rule.
    expect(ids(await check({ rules }, 'ok'))).toEqual(['1', '3', '6']);
    expect((await check({ rules }, 'ok')).columns).toEqual(input.columns);
  });

  it('errors has one row for every rule that a row fails: a row that fails two rules appears twice', async () => {
    const r = await check({ rules }, 'errors');
    expect(r.columns.map((c) => c.name)).toEqual(['Id', 'Hours', 'Dept', 'Rule', 'Message']);
    expect(r.columns.slice(3)).toEqual([{ name: 'Rule', type: 'text' }, { name: 'Message', type: 'text' }]);
    // Row 2 (30 hours), row 4 (-2 hours and no department: twice), row 5 (40 hours and no department: twice).
    expect(r.rows.map((x) => [x[0], x[3]])).toEqual([
      ['2', 'Hours range'],
      ['4', 'Hours range'],
      ['4', 'Department'],
      ['5', 'Hours range'],
      ['5', 'Department'],
    ]);
    expect(r.rows[0]!.slice(1)).toEqual([30, 'B', 'Hours range', 'Hours must be from 0 to 24.']);
  });

  it('counts a null condition as a fail, and ok and errors together cover every row once or more', async () => {
    const ok = await check({ rules: [{ name: 'Has hours', condition: 'OR([Hours] > 0, [Hours] <= 0)', message: 'No hours.' }] }, 'ok');
    // A blank number counts as 0 in a comparison, so use a rule on a column where blank gives null.
    expect(ok.rows.length).toBeGreaterThan(0);
    const dates: TableData = { columns: [{ name: 'Id', type: 'text' }, { name: 'Day', type: 'date' }], rows: [['a', '2026-09-01'], ['b', null]] };
    const rule = [{ name: 'Day set', condition: '[Day] > DATE(2026, 1, 1)', message: 'No day.' }];
    expect(ids(await check({ rules: rule }, 'ok', dates))).toEqual(['a']);
    expect(ids(await check({ rules: rule }, 'errors', dates))).toEqual(['b']);
  });

  it('puts every row in ok when the rules all pass, and none in errors', async () => {
    const pass = [{ name: 'Always', condition: 'TRUE', message: 'Never shown.' }];
    expect((await check({ rules: pass }, 'ok')).rows).toHaveLength(input.rows.length);
    expect((await check({ rules: pass }, 'errors')).rows).toEqual([]);
  });

  it('works on an empty table, and escapes quotes in a rule name and a message', async () => {
    const empty = { columns: input.columns, rows: [] };
    expect((await check({ rules }, 'ok', empty)).rows).toEqual([]);
    expect((await check({ rules }, 'errors', empty)).rows).toEqual([]);
    const quoted = [{ name: "Owner's rule", condition: 'FALSE', message: "It's wrong" }];
    const r = await check({ rules: quoted }, 'errors', { columns: input.columns, rows: [input.rows[0]!] });
    expect(r.rows[0]!.slice(3)).toEqual(["Owner's rule", "It's wrong"]);
  });
});

describe('check node: the quiet warning and the stop', () => {
  const flow = (stop: boolean) => ({
    schemaVersion: FLOW_SCHEMA_VERSION,
    nodes: [
      { id: 'src', type: 'input_file', settings: { key: 'k' } },
      { id: 'chk', type: 'check', label: 'Timesheet check', settings: { rules, stop } },
    ],
    edges: [{ source: 'src', target: 'chk' }],
  });
  const run = (stop: boolean, stopChecks?: boolean) => runFlow(runner, { flow: flow(stop), effectiveDate: '2026-09-30', inputs: { k: input }, refTables: {}, ...(stopChecks === undefined ? {} : { stopChecks }) });

  it('tells the count of each rule that failed, as a warning with its message, and does not stop', async () => {
    const r = await run(false);
    try {
      expect(r.warnings.map((w) => [w.messageId, w.params.rule, w.params.n])).toEqual([['engine.checkFailedRule', 'Hours range', 3], ['engine.checkFailedRule', 'Department', 2]]);
      expect(r.warnings[0]!.message).toContain('Timesheet check');
      expect(r.warnings[0]!.message).toContain('Hours must be from 0 to 24.');
    } finally {
      await r.dispose();
    }
  });

  it('stops a run with the count per rule when "stop the run" is on', async () => {
    await expect(run(true)).rejects.toThrow(/Timesheet check.*"Hours range" \(3\), "Department" \(2\).*turn off "Stop the run/);
    await expect(run(true)).rejects.toMatchObject({ code: 'check_failed', nodeId: 'chk' });
  });

  it('reports instead of stopping in a preview, which passes stopChecks false', async () => {
    const r = await run(true, false);
    try {
      expect(r.warnings).toHaveLength(2);
      expect((await r.preview('chk', 'ok')).rows).toHaveLength(3);
    } finally {
      await r.dispose();
    }
  });

  it('says nothing when no row fails, even with stop on', async () => {
    const r = await runFlow(runner, { flow: { ...flow(true), nodes: [flow(true).nodes[0]!, { id: 'chk', type: 'check', settings: { rules: [{ name: 'T', condition: 'TRUE', message: 'm' }], stop: true } }] }, effectiveDate: '2026-09-30', inputs: { k: input }, refTables: {} });
    try {
      expect(r.warnings).toEqual([]);
    } finally {
      await r.dispose();
    }
  });
});

describe('check node: what is refused', () => {
  const run = (settings: Record<string, unknown>, data = input) => check(settings, 'ok', data);
  it('says which rule and where for an invalid formula, and for a condition that is not true or false', async () => {
    await expect(run({ rules: [{ name: 'Bad', condition: '[Hours] >', message: 'm' }] })).rejects.toThrow(/rule "Bad" \(character \d+\)/);
    await expect(run({ rules: [{ name: 'Sum', condition: '[Hours] + 1', message: 'm' }] })).rejects.toThrow(/rule "Sum".*true or false.*number/);
    await expect(run({ rules: [{ name: 'Col', condition: '[Nope] > 1', message: 'm' }] })).rejects.toBeInstanceOf(EngineError);
  });
  it('says what to do for no rules, a rule with no name, condition or message, a name used twice', async () => {
    await expect(run({ rules: [] })).rejects.toThrow(/no rule\. Add a rule/);
    await expect(run({ rules: [{ condition: 'TRUE', message: 'm' }] })).rejects.toThrow(/rule 1 has no name/);
    await expect(run({ rules: [{ name: 'A', message: 'm' }] })).rejects.toThrow(/rule "A" has no condition/);
    await expect(run({ rules: [{ name: 'A', condition: 'TRUE' }] })).rejects.toThrow(/rule "A" has no message/);
    await expect(run({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }, { name: 'A', condition: 'TRUE', message: 'm' }] })).rejects.toThrow(/used twice/);
  });
  it('refuses an input that already has a column named Rule or Message', async () => {
    const clash: TableData = { columns: [{ name: 'Rule', type: 'text' }], rows: [['x']] };
    await expect(run({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }] }, clash)).rejects.toThrow(/already has a column named "Rule"/);
  });
});

describe('parseCheckSettings', () => {
  it('reads the rules and stop, off by default', () => {
    expect(parseCheckSettings({ rules: [{ name: ' A ', condition: 'TRUE', message: 'm' }] }, 'n')).toEqual({ rules: [{ name: 'A', condition: 'TRUE', message: 'm' }], stop: false });
  });
});
