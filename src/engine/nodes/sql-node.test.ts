import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeRunner } from '../runner/node-runner';
import { EngineError, type SqlRunner, type TableData } from '../types';
import { checkSqlText } from './sql-node';
import { runNode } from './test-helpers';

let runner: SqlRunner;
beforeAll(async () => {
  runner = await createNodeRunner();
});
afterAll(async () => {
  await runner.close();
});

const people: TableData = {
  columns: [
    { name: 'Id', type: 'number' },
    { name: 'Name', type: 'text' },
    { name: 'Born', type: 'date' },
    { name: 'Active', type: 'boolean' },
  ],
  rows: [
    [1, 'a', '2000-01-01', true],
    [2, 'b', '1990-05-05', false],
    [3, 'c', '1980-12-31', true],
  ],
};
const scores: TableData = {
  columns: [
    { name: 'Id', type: 'number' },
    { name: 'Score', type: 'number' },
  ],
  rows: [[1, 10], [3, 30]],
};

const run = (sql: unknown, inputs: Record<string, TableData> = { in1: people }) =>
  runNode(runner, 'sql', { settings: { sql }, inputs });

describe('sql node', () => {
  it('runs a query on the input, named in1, with exact column types', async () => {
    const r = await run('SELECT "Id", "Name", "Born", "Active" FROM in1 WHERE "Active" ORDER BY "Id" DESC');
    expect(r.columns).toEqual(people.columns);
    expect(r.rows).toEqual([[3, 'c', '1980-12-31', true], [1, 'a', '2000-01-01', true]]);
  });

  it('joins several inputs, in1, in2, ...', async () => {
    const r = await run('SELECT p."Name", s."Score" FROM in1 p JOIN in2 s ON p."Id" = s."Id" ORDER BY s."Score"', { in1: people, in2: scores });
    expect(r.rows).toEqual([['a', 10], ['c', 30]]);
  });

  it('turns every number into a DOUBLE number, also counts', async () => {
    const r = await run('SELECT count(*) AS n, CAST(sum("Id") AS INTEGER) AS s, 1.5 AS d FROM in1');
    expect(r.columns.map((c) => c.type)).toEqual(['number', 'number', 'number']);
    expect(r.rows).toEqual([[3, 6, 1.5]]);
  });

  it('accepts a query that starts with WITH, and a trailing semicolon and comments', async () => {
    const r = await run('-- totals\nWITH t AS (SELECT "Id" FROM in1) /* all */ SELECT count(*) AS n FROM t;');
    expect(r.rows).toEqual([[3]]);
  });

  it('reports a SQL error with the step id and the database message', async () => {
    const err = await run('SELECT nope FROM in1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('node_failed');
    expect((err as EngineError).nodeId).toBe('under_test');
    expect((err as EngineError).message).toMatch(/nope/);
    expect((err as EngineError).message).toMatch(/SQL/);
  });

  it('refuses result types it cannot carry, and duplicate column names', async () => {
    const ts = await run(`SELECT TIMESTAMP '2026-01-01 10:00:00' AS t`).catch((e: unknown) => e);
    expect((ts as EngineError).code).toBe('invalid_settings');
    expect((ts as EngineError).message).toMatch(/CAST/);
    const dup = await run('SELECT 1 AS a, 2 AS A').catch((e: unknown) => e);
    expect((dup as EngineError).code).toBe('invalid_settings');
  });

  it('refuses a missing or empty SQL text', async () => {
    for (const bad of [undefined, '', '   ', 5]) {
      const err = await run(bad).catch((e: unknown) => e);
      expect((err as EngineError).code, String(bad)).toBe('invalid_settings');
    }
  });
});

describe('sql safety check', () => {
  it('lets a read-only query through, also when forbidden words sit in text, names or comments', () => {
    for (const ok of [
      'SELECT 1',
      "SELECT 'read_csv', 'copy; drop table x' AS note FROM in1",
      'SELECT "read_csv", "update" FROM in1',
      'SELECT 1 -- drop table x\n',
      'SELECT /* attach */ 1',
      "SELECT * FROM in1 WHERE \"Name\" IN ('a', 'b')",
      'WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 3) SELECT * FROM t',
    ]) {
      expect(checkSqlText(ok), ok).toBeUndefined();
    }
  });

  it('refuses everything except one SELECT or WITH query', () => {
    for (const bad of [
      'SELECT 1; SELECT 2',
      'COPY (SELECT 1) TO \'x.csv\'',
      'ATTACH \'x.db\'',
      'INSTALL httpfs',
      'LOAD httpfs',
      'PRAGMA database_list',
      'SET threads = 1',
      'CREATE TABLE x AS SELECT 1',
      'DROP TABLE in1',
      'INSERT INTO in1 VALUES (1)',
      'UPDATE in1 SET a = 1',
      'DELETE FROM in1',
      'WITH t AS (SELECT 1) DELETE FROM in1',
      'WITH t AS (SELECT 1) INSERT INTO x SELECT * FROM t',
      'CALL pragma_version()',
      'EXPORT DATABASE \'x\'',
    ]) {
      expect(checkSqlText(bad), bad).toBeTypeOf('string');
    }
  });

  it('refuses functions that read files or addresses, or run text as SQL', () => {
    for (const bad of [
      "SELECT * FROM read_csv('a.csv')",
      "SELECT * FROM read_parquet('a')",
      "SELECT * FROM READ_JSON_AUTO('a')",
      "SELECT * FROM parquet_scan('a')",
      "SELECT * FROM glob('*')",
      "SELECT * FROM sniff_csv('a')",
      "SELECT * FROM query('SELECT 1')",
      "SELECT * FROM query_table('in1')",
      "SELECT * FROM 'https://example.test/data.csv'",
      "SELECT * FROM in1 JOIN 'file.csv' ON TRUE",
    ]) {
      expect(checkSqlText(bad), bad).toBeTypeOf('string');
    }
  });

  it('says what to do in its message, and the step refuses a forbidden query', async () => {
    const msg = checkSqlText('DROP TABLE in1') as string;
    expect(msg).toMatch(/SELECT/);
    const err = await run('DROP TABLE in1').catch((e: unknown) => e);
    expect((err as EngineError).code).toBe('invalid_settings');
  });
});
