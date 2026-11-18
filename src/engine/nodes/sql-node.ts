import { quoteIdent } from '../sql';
import { EngineError, type Column, type ColumnType } from '../types';
import type { NodeModule } from './types';

/** Blanks out comments, the content of text values and of quoted names, so that only SQL keywords remain. */
function scrub(sql: string): string {
  let out = '';
  for (let i = 0; i < sql.length; ) {
    const ch = sql[i]!;
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += ' ';
    } else if (ch === "'" || ch === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) i += 2;
          else break;
        } else i++;
      }
      i++;
      out += ch + ch;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

const FORBIDDEN_WORDS = new Set([
  'insert', 'update', 'delete', 'create', 'drop', 'alter', 'attach', 'detach', 'copy', 'install', 'load', 'pragma',
  'export', 'import', 'checkpoint', 'vacuum', 'glob', 'sniff_csv', 'query', 'query_table',
]);

/**
 * A best-effort check that the text is one read-only SELECT or WITH query that reads no file, no address and runs no
 * text as SQL. It returns a message that says what to do, or undefined when the text passes. See D26.
 */
export function checkSqlText(sql: string): string | undefined {
  const refuse = (what: string) =>
    `The SQL step may only run one SELECT or WITH query on its inputs. ${what} Remove it, or use the other steps (Filter, Formula column, Lookup) instead.`;
  const text = scrub(sql).replace(/[\s;]+$/, '');
  if (text.includes(';')) return refuse('It has more than one statement.');
  const first = /^\s*([a-z_]+)/i.exec(text)?.[1]?.toLowerCase();
  if (first !== 'select' && first !== 'with') return refuse(`It starts with ${first ? `"${first.toUpperCase()}"` : 'something else'}.`);
  for (const m of text.matchAll(/[a-z_][a-z0-9_$]*/gi)) {
    const w = m[0].toLowerCase();
    if (FORBIDDEN_WORDS.has(w) || w.startsWith('read_') || w.endsWith('_scan') || w.startsWith('http_')) {
      return refuse(`"${m[0]}" is not allowed.`);
    }
  }
  if (/\b(from|join)\s*''/i.test(text)) return refuse('It reads a file or an address by name.');
  return undefined;
}

function columnType(name: string, duckType: string, nodeId: string): ColumnType {
  const t = duckType.toUpperCase();
  if (t === 'VARCHAR') return 'text';
  if (t === 'DATE') return 'date';
  if (t === 'BOOLEAN') return 'boolean';
  if (/^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\))$/.test(t)) return 'number';
  throw new EngineError(
    'invalid_settings',
    `SQL step "${nodeId}": the column "${name}" has the type ${duckType}, which a flow cannot carry. Change it in the query with CAST(... AS VARCHAR), CAST(... AS DATE) or CAST(... AS DOUBLE).`,
    nodeId,
  );
}

/**
 * Runs free SQL on the inputs, which the query sees as in1, in2, ... Numbers come out as DOUBLE, like everywhere in
 * the engine. The query is checked by `checkSqlText` first.
 */
export const sqlNode: NodeModule = {
  type: 'sql',
  compile: async ({ node, inputs, query }) => {
    const sql = node.settings.sql;
    if (typeof sql !== 'string' || sql.trim() === '') {
      throw new EngineError(
        'invalid_settings',
        `SQL step "${node.id}": "sql" must be a query. Type a SELECT query in the step settings; the inputs are called in1, in2, ...`,
        node.id,
      );
    }
    const refusal = checkSqlText(sql);
    if (refusal) throw new EngineError('invalid_settings', `SQL step "${node.id}": ${refusal}`, node.id);

    const handles = Object.keys(inputs).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const ctes = handles.map((h) => `${h} AS (SELECT * FROM ${quoteIdent(inputs[h]!.relation)})`).join(', ');
    // The query runs as the top statement, so that DESCRIBE sees its own column names (a wrapper would rename duplicates).
    // A trailing line comment needs a newline before anything that follows it.
    const body = sql.replace(/[\s;]+$/, '').replace(/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '');
    const withClause = /^with\s+(recursive\s+)?/i.exec(body);
    const inner = withClause ? `WITH ${withClause[1] ?? ''}${ctes},\n${body.slice(withClause[0].length)}\n` : `WITH ${ctes}\n${body}\n`;

    let described: unknown[][];
    try {
      described = (await query(`DESCRIBE ${inner}`)).rows;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new EngineError('node_failed', `SQL step "${node.id}": the SQL has an error: ${reason} Fix the query in the step settings.`, node.id);
    }
    const columns: Column[] = described.map((row) => ({
      name: String(row[0]),
      type: columnType(String(row[0]), String(row[1]), node.id),
    }));
    const seen = new Set<string>();
    for (const c of columns) {
      if (seen.has(c.name.toLowerCase())) {
        throw new EngineError(
          'invalid_settings',
          `SQL step "${node.id}": the result has the column name "${c.name}" more than once (names that differ only by case count as equal). Give each column its own name with AS.`,
          node.id,
        );
      }
      seen.add(c.name.toLowerCase());
    }
    const list = columns.map((c) => (c.type === 'number' ? `CAST(${quoteIdent(c.name)} AS DOUBLE) AS ${quoteIdent(c.name)}` : quoteIdent(c.name)));
    return { out: { sql: `SELECT ${list.join(', ')} FROM (${inner})`, columns } };
  },
};
