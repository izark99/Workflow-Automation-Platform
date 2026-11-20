import { readXlsx, XlsxReadError, type CellValue } from '../xlsx-stream';
import { requireColumn } from '../nodes/columns';
import { columnNumber, MAX_BLANK_ROWS, STOP_MATCHES, textMatches, type StopRule } from './region';
import { checkFileSize } from '../size-guard';
import { createTableStatement, insertRowsStatements, quoteIdent, quoteString } from '../sql';
import { megabytes } from '../messages';
import { coded, EngineError, warning, type EngineWarning, type Cell, type Column, type ColumnType, type LoadedTable, type SqlRunner } from '../types';

export interface InputFileSettings {
  /** Logical name of the input, for example "Timesheet". The run screen asks for one file per key. */
  key: string;
  /** Sheet name. The first sheet is the default. Ignored for csv. */
  sheet: string | undefined;
  /** Row of the header, counted from 1 in the file. */
  headerRow: number;
  /** Rows to skip after the header row. */
  skipRows: number;
  /** Columns whose empty cells take the value above. For merged cells. */
  fillDown: string[];
  /** Name of an added column that holds the row number in the file. No column is added when unset. */
  rowNumberColumn: string | undefined;
  /** The region (SPEC 13.2): the first and last column of the table (1-based; the last is open when unset). */
  firstColumn: number;
  lastColumn: number | undefined;
  /** Where the reading stops. The end of the sheet when unset. */
  stopAt: StopRule;
  /** Rows inside the table to leave out: those that have the text in the column. */
  ignoreRows: { column: string; text: string }[];
  /** The columns that the file must have (case and order do not matter). Nothing is required when empty. */
  expect: string[];
}

export interface FileSource {
  name: string;
  size: number;
  blob: Blob;
}

export function parseInputSettings(raw: Record<string, unknown>, nodeId: string): InputFileSettings {
  const bad = (setting: string, rule: string): never => {
    throw new EngineError('invalid_settings', `Input step "${nodeId}": "${setting}" ${rule}. Change it in the step settings.`, nodeId);
  };
  if (typeof raw.key !== 'string' || raw.key.trim() === '') bad('key', 'must be a non-empty name');
  const int = (name: string, min: number, fallback: number): number => {
    const v = raw[name];
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) bad(name, `must be a whole number of ${min} or more`);
    return v as number;
  };
  const text = (name: string): string | undefined => {
    const v = raw[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v === '') bad(name, 'must be a non-empty text');
    return v as string;
  };
  const fillDown = raw.fillDown ?? [];
  if (!Array.isArray(fillDown) || fillDown.some((c) => typeof c !== 'string')) bad('fillDown', 'must be a list of column names');

  // The region.
  const column = (value: unknown, name: string): number | undefined => {
    if (value === undefined) return undefined;
    const n = columnNumber(value);
    if (n === undefined) bad(name, 'must be a column letter such as C, or a column number such as 3');
    return n;
  };
  const firstColumn = column(raw.firstColumn, 'firstColumn') ?? 1;
  const lastColumn = column(raw.lastColumn, 'lastColumn');
  if (lastColumn !== undefined && lastColumn < firstColumn) bad('lastColumn', 'must not be before the first column');
  const nonEmpty = (v: unknown, name: string): string => {
    if (typeof v !== 'string' || v.trim() === '') bad(name, 'must be a text that is not empty');
    return v as string;
  };
  let stopAt: StopRule = { kind: 'end' };
  if (raw.stopAt !== undefined) {
    const o = raw.stopAt;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return bad('stopAt', 'must say where to stop, for example {"kind": "end"}');
    const r = o as Record<string, unknown>;
    if (r.kind === 'end') stopAt = { kind: 'end' };
    else if (r.kind === 'blank_rows') {
      const count = r.count === undefined ? 1 : r.count;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_BLANK_ROWS) bad('stopAt.count', `must be a whole number from 1 to ${MAX_BLANK_ROWS}`);
      stopAt = { kind: 'blank_rows', count: count as number };
    } else if (r.kind === 'marker') {
      const match = r.match === undefined ? 'contains' : r.match;
      if (!(STOP_MATCHES as readonly unknown[]).includes(match)) bad('stopAt.match', `must be one of: ${STOP_MATCHES.join(', ')}`);
      stopAt = { kind: 'marker', text: nonEmpty(r.text, 'stopAt.text'), match: match as 'contains' | 'starts_with' | 'equals', ...(r.column === undefined ? {} : { column: nonEmpty(r.column, 'stopAt.column') }) };
    } else if (r.kind === 'row') {
      if (typeof r.row !== 'number' || !Number.isInteger(r.row) || r.row < 1) bad('stopAt.row', 'must be a whole number of 1 or more');
      stopAt = { kind: 'row', row: r.row as number };
    } else bad('stopAt.kind', 'must be one of: end, blank_rows, marker, row');
  }
  const ignoreRaw = raw.ignoreRows ?? [];
  if (!Array.isArray(ignoreRaw)) bad('ignoreRows', 'must be a list of a column and a text');
  const ignoreRows = (ignoreRaw as unknown[]).map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return bad(`ignoreRows ${i + 1}`, 'must have a column and a text');
    const o = item as Record<string, unknown>;
    return { column: nonEmpty(o.column, `ignoreRows ${i + 1} column`), text: nonEmpty(o.text, `ignoreRows ${i + 1} text`) };
  });
  const expectRaw = raw.expect ?? [];
  if (!Array.isArray(expectRaw)) bad('expect', 'must be a list of column names');
  const expectNames = (expectRaw as unknown[]).map((c, i) => nonEmpty(c, `expect ${i + 1}`));

  return {
    key: raw.key as string,
    sheet: text('sheet'),
    headerRow: int('headerRow', 1, 1),
    skipRows: int('skipRows', 0, 0),
    fillDown: fillDown as string[],
    rowNumberColumn: text('rowNumberColumn'),
    firstColumn,
    lastColumn,
    stopAt,
    ignoreRows,
    expect: expectNames,
  };
}

/** The delimiters that a csv file may use, in the order that wins a tie. */
const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;
const MAX_CSV_COLUMNS = 16_384;
const MIDNIGHT = /T00:00:00\.000Z$/;
const CSV_NUMBER = '-?(0|[1-9][0-9]*)(\\.[0-9]+)?';
const CSV_DATE = '[0-9]{4}-[0-9]{2}-[0-9]{2}';

/** Builds column names from a header row: text, `Column N` for an empty cell, trailing empties dropped. */
function headerNames(cells: readonly unknown[], nodeId: string): string[] {
  let width = cells.length;
  while (width > 0 && (cells[width - 1] === undefined || cells[width - 1] === null || cells[width - 1] === '')) width--;
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    const c = cells[i];
    const name = c === undefined || c === null || c === '' ? `Column ${i + 1}` : c instanceof Date ? c.toISOString().slice(0, 10) : String(c);
    if (names.includes(name)) {
      throw new EngineError(
        'file_read_failed',
        `The header row has the column name "${name}" more than once. Rename one of them in the file, or pick another header row.`,
        nodeId,
      );
    }
    names.push(name);
  }
  return names;
}

function checkSettingsAgainstHeader(names: string[], s: InputFileSettings, nodeId: string): void {
  const columns: Column[] = names.map((name) => ({ name, type: 'text' }));
  for (const c of s.fillDown) requireColumn(columns, c, nodeId);
  for (const r of s.ignoreRows) requireColumn(columns, r.column, nodeId);
  if (s.stopAt.kind === 'marker' && s.stopAt.column !== undefined) requireColumn(columns, s.stopAt.column, nodeId);
  if (s.rowNumberColumn !== undefined && names.includes(s.rowNumberColumn)) {
    throw new EngineError(
      'invalid_settings',
      `The file already has a column "${s.rowNumberColumn}". Choose another name for the row number column.`,
      nodeId,
    );
  }
}

/**
 * The columns that the file must have (SPEC 13.2 item 2): case and order do not matter, other columns are allowed. A missing
 * one stops the load, with what is missing and what the file has, before any row is read.
 */
function checkExpected(names: string[], expected: string[], fileName: string, nodeId: string): void {
  if (expected.length === 0) return;
  const have = new Set(names.map((n) => n.trim().toLowerCase()));
  const missing = expected.filter((c) => !have.has(c.trim().toLowerCase()));
  if (missing.length === 0) return;
  throw coded('file_read_failed', 'engine.inputMissingColumns', { file: fileName, missing: missing.map((c) => `"${c}"`).join(', '), have: names.length > 0 ? names.join(', ') : '(no column names)' }, nodeId);
}

/** Final table: casts the text stage to the chosen types. The stage is dropped. */
async function finalize(runner: SqlRunner, stage: string, relation: string, columns: Column[]): Promise<LoadedTable> {
  const list = columns
    .map((c) => {
      const id = quoteIdent(c.name);
      if (c.type === 'number') return `CAST(${id} AS DOUBLE) AS ${id}`;
      if (c.type === 'date') return `CAST(${id} AS DATE) AS ${id}`;
      if (c.type === 'boolean') return `CAST(${id} AS BOOLEAN) AS ${id}`;
      return id;
    })
    .join(', ');
  await runner.exec(`CREATE OR REPLACE TABLE ${quoteIdent(relation)} AS SELECT ${list} FROM ${quoteIdent(stage)}`);
  await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(stage)}`);
  return { relation, columns };
}

type Kinds = { number: boolean; date: boolean; boolean: boolean; text: boolean; any: boolean };

function pickType(k: Kinds): ColumnType {
  if (!k.any || k.text) return 'text';
  const kinds = [k.number, k.date, k.boolean].filter(Boolean).length;
  if (kinds > 1) return 'text';
  return k.number ? 'number' : k.date ? 'date' : 'boolean';
}

function toText(v: Exclude<CellValue, undefined>): string {
  if (v instanceof Date) {
    const iso = v.toISOString();
    return MIDNIGHT.test(iso) ? iso.slice(0, 10) : iso;
  }
  return String(v);
}

/** Counts what a read consumed. For tests: a stop rule must end the reading of a long file early. */
export interface LoadStats {
  /** Rows of the sheet that the reader took from the file, the title rows and the header row included. */
  rowsRead: number;
  /** Things that the load did and that the person should know, such as a stop text that was never found. */
  warnings?: EngineWarning[];
}

async function loadXlsx(runner: SqlRunner, file: FileSource, s: InputFileSettings, relation: string, nodeId: string, stats?: LoadStats) {
  const stage = `${relation}_stage`;
  let names: string[] | undefined;
  let kinds: Kinds[] = [];
  let stageColumns: Column[] = [];
  let fillIndexes: number[] = [];
  let last: (string | null)[] = [];
  let batch: Cell[][] = [];
  const flush = async () => {
    for (const sql of insertRowsStatements(stage, stageColumns, batch)) await runner.exec(sql);
    batch = [];
  };
  // The region: the columns from the first to the last, as 0-based positions in the cells of a row.
  const from = s.firstColumn - 1;
  const emptyCell = (v: CellValue): boolean => v === undefined || v === '';
  let ignore: { index: number; text: string }[] = [];
  let markerIndex: number | undefined;
  let blankRun = 0;
  let markerFound = false;
  // The reader gives the rows that the sheet holds: an empty row is not in the file, and shows only as a gap in the numbers.
  let lastRow = 0;

  try {
    for await (const { row, cells } of readXlsx(file.blob, s.sheet === undefined ? {} : { sheetName: s.sheet })) {
      if (stats) stats.rowsRead++;
      if (row < s.headerRow) continue;
      if (row === s.headerRow) {
        names = headerNames(cells.slice(from, s.lastColumn), nodeId);
        checkExpected(names, s.expect, file.name, nodeId);
        checkSettingsAgainstHeader(names, s, nodeId);
        ignore = s.ignoreRows.map((r) => ({ index: names!.indexOf(r.column), text: r.text }));
        markerIndex = s.stopAt.kind === 'marker' && s.stopAt.column !== undefined ? names.indexOf(s.stopAt.column) : undefined;
        kinds = names.map(() => ({ number: false, date: false, boolean: false, text: false, any: false }));
        fillIndexes = s.fillDown.map((c) => names!.indexOf(c));
        last = names.map(() => null);
        stageColumns = names.map((name) => ({ name, type: 'text' as const }));
        if (s.rowNumberColumn !== undefined) stageColumns.push({ name: s.rowNumberColumn, type: 'text' });
        await runner.exec(createTableStatement(stage, stageColumns));
        continue;
      }
      if (!names) break;
      if (row <= s.headerRow + s.skipRows) continue;

      // The stop rule: the rows from here on are not read, and a long footer is never taken from the file.
      const stop = s.stopAt;
      const gap = row - Math.max(lastRow, s.headerRow + s.skipRows) - 1;
      lastRow = row;
      if (gap > 0) {
        blankRun += gap;
        if (stop.kind === 'blank_rows' && blankRun >= stop.count) break;
      }
      if (stop.kind === 'row' && row > stop.row) break;
      if (stop.kind === 'marker') {
        const hit = markerIndex !== undefined ? !emptyCell(cells[from + markerIndex]) && textMatches(toText(cells[from + markerIndex]!), stop.text, stop.match) : cells.some((c) => !emptyCell(c) && textMatches(toText(c!), stop.text, stop.match));
        if (hit) {
          markerFound = true;
          break;
        }
      }
      const region = names.map((_, i) => cells[from + i]);
      // A row to ignore is not empty, whatever it holds: it neither ends the table nor adds a row to it.
      if (ignore.some(({ index, text }) => !emptyCell(region[index]) && textMatches(toText(region[index]!), text, 'contains'))) {
        blankRun = 0;
        continue;
      }
      if (region.every(emptyCell)) {
        blankRun++;
        if (stop.kind === 'blank_rows' && blankRun >= stop.count) break;
        continue;
      }
      blankRun = 0;

      const values: (string | null)[] = names.map((_, i) => {
        const v = region[i];
        return v === undefined || v === '' ? null : toText(v);
      });
      names.forEach((_, i) => {
        if (values[i] === null && fillIndexes.includes(i)) values[i] = last[i] ?? null;
      });
      names.forEach((_, i) => {
        const raw = region[i];
        const k = kinds[i]!;
        // A filled-down value keeps the kind of the cell it came from, which is already counted.
        if (raw === undefined || raw === '') {
          if (values[i] !== null) k.any = true;
          return;
        }
        k.any = true;
        if (typeof raw === 'number') k.number = true;
        else if (raw instanceof Date) {
          if (MIDNIGHT.test(raw.toISOString())) k.date = true;
          else k.text = true;
        } else if (typeof raw === 'boolean') k.boolean = true;
        else k.text = true;
      });
      names.forEach((_, i) => {
        if (values[i] !== null) last[i] = values[i]!;
      });
      const out: Cell[] = [...values];
      if (s.rowNumberColumn !== undefined) out.push(String(row));
      batch.push(out);
      if (batch.length >= 2000) await flush();
    }
    if (!names) {
      throw coded('file_read_failed', 'engine.inputNoHeader', { file: file.name, row: s.headerRow, step: nodeId }, nodeId);
    }
    await flush();
    if (s.stopAt.kind === 'marker' && !markerFound) stats?.warnings?.push(warning('engine.inputStopNotFound', { text: s.stopAt.text, file: file.name, step: nodeId }, nodeId));
  } catch (e) {
    await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(stage)}`);
    if (e instanceof XlsxReadError) throw new EngineError('file_read_failed', `${file.name}: ${e.message}`, nodeId);
    throw e;
  }
  const columns: Column[] = names.map((name, i) => ({ name, type: pickType(kinds[i]!) }));
  if (s.rowNumberColumn !== undefined) columns.push({ name: s.rowNumberColumn, type: 'number' });
  return finalize(runner, stage, relation, columns);
}

/** SQL for "this text matches": the text is quoted, so it is never read as SQL. Not case sensitive. */
function sqlMatches(expr: string, text: string, match: 'contains' | 'starts_with' | 'equals'): string {
  const value = `lower(coalesce(${expr}, ''))`;
  const t = quoteString(text.toLowerCase());
  if (match === 'contains') return `strpos(${value}, ${t}) > 0`;
  if (match === 'starts_with') return `starts_with(ltrim(${value}), ltrim(${t}))`;
  return `trim(${value}) = trim(${t})`;
}

async function loadCsv(runner: SqlRunner, file: FileSource, s: InputFileSettings, relation: string, nodeId: string, stats?: LoadStats) {
  const raw = `${relation}_raw`;
  const rows = `${relation}_rows`;
  const stage = `${relation}_stage`;
  const virtualName = `${relation}.csv`;
  await runner.registerFile(virtualName, file.blob);
  try {
    // The file is read with a dialect that is decided here, not by the sniffer of DuckDB: a file with a title block above the
    // table has rows of different widths, and the sniffer takes the title for the whole format. The delimiter is the candidate
    // that splits the most lines, and the width is that of the widest line (counting a delimiter inside quotes too, which can
    // only make the width larger; the cells that are not there are empty).
    const lines = `read_csv(${quoteString(virtualName)}, columns = {'line': 'VARCHAR'}, delim = chr(1), quote = '', escape = '', header = false, auto_detect = false, skip = 0)`;
    const counts = (d: string) => `length("line") - length(replace("line", ${quoteString(d)}, ''))`;
    const dialect = await runner.query(
      `SELECT ${CSV_DELIMITERS.map((d, i) => `coalesce(sum(CASE WHEN ${counts(d)} >= 1 THEN 1 ELSE 0 END), 0) AS lines${i}, coalesce(max(${counts(d)}), 0) AS widest${i}`).join(', ')} FROM ${lines}`,
    );
    const row0 = dialect.rows[0] ?? [];
    let best = 0;
    CSV_DELIMITERS.forEach((_, i) => {
      if (Number(row0[i * 2] ?? 0) > Number(row0[best * 2] ?? 0)) best = i;
    });
    const delimiter = CSV_DELIMITERS[best]!;
    const width = Math.min(MAX_CSV_COLUMNS, Number(row0[best * 2 + 1] ?? 0) + 1);
    const columnList = Array.from({ length: width }, (_, i) => `'column${i}': 'VARCHAR'`).join(', ');
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(raw)} AS SELECT row_number() OVER () AS "__rn", * ` +
        `FROM read_csv(${quoteString(virtualName)}, header = false, skip = 0, delim = ${quoteString(delimiter)}, quote = '"', escape = '"', columns = {${columnList}}, auto_detect = false, null_padding = true, ignore_errors = false)`,
    );
    // DuckDB drops empty lines of a table, so the rows are numbered by the line of the file they stand on: the n-th row is
    // the n-th line that is not empty. When the counts differ (a quoted cell that holds a line break) the order is kept.
    const mapped = await runner.query(
      `SELECT (SELECT count(*) FROM ${lines} WHERE "line" IS NOT NULL) AS lines, (SELECT count(*) FROM ${quoteIdent(raw)}) AS parsed`,
    );
    if (Number(mapped.rows[0]?.[0]) === Number(mapped.rows[0]?.[1])) {
      await runner.exec(
        `CREATE OR REPLACE TABLE ${quoteIdent(raw)} AS SELECT n."file_row" AS "__rn", r.* EXCLUDE ("__rn") FROM ${quoteIdent(raw)} r JOIN ` +
          `(SELECT file_row, row_number() OVER (ORDER BY file_row) AS idx FROM (SELECT row_number() OVER () AS file_row, "line" FROM ${lines}) WHERE "line" IS NOT NULL) n ON n.idx = r."__rn"`,
      );
    }
    const head = await runner.query(`SELECT * EXCLUDE ("__rn") FROM ${quoteIdent(raw)} WHERE "__rn" = ${s.headerRow}`);
    const headCells = head.rows[0];
    if (!headCells) {
      throw coded('file_read_failed', 'engine.inputNoHeader', { file: file.name, row: s.headerRow, step: nodeId }, nodeId);
    }
    // The region: the columns from the first to the last of the file, as positions in the cells of a row.
    const from = s.firstColumn - 1;
    const names = headerNames(headCells.slice(from, s.lastColumn), nodeId);
    checkExpected(names, s.expect, file.name, nodeId);
    checkSettingsAgainstHeader(names, s, nodeId);
    const src = (i: number) => quoteIdent(head.columns[from + i]!);
    const cell = (i: number) => `NULLIF(${src(i)}, '')`;
    const allColumns = head.columns.map((c) => quoteIdent(c));
    const blank = names.map((_, i) => `${cell(i)} IS NULL`).join(' AND ') || 'TRUE';
    const ignored = s.ignoreRows.length === 0 ? 'FALSE' : s.ignoreRows.map((r) => `(${cell(names.indexOf(r.column))} IS NOT NULL AND ${sqlMatches(cell(names.indexOf(r.column)), r.text, 'contains')})`).join(' OR ');
    const stop = s.stopAt;
    const markerTest =
      stop.kind !== 'marker'
        ? 'FALSE'
        : stop.column !== undefined
          ? sqlMatches(cell(names.indexOf(stop.column)), stop.text, stop.match)
          : allColumns.map((c) => `(NULLIF(${c}, '') IS NOT NULL AND ${sqlMatches(c, stop.text, stop.match)})`).join(' OR ') || 'FALSE';

    // The rows after the header and the rows to skip, with the flags that the stop rule and the rows to ignore need.
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(rows)} AS SELECT "__rn", ${names.map((n, i) => `${cell(i)} AS ${quoteIdent(`c${i}`)}`).join(', ')}, ` +
        `${blank} AS "__blank", (${ignored}) AS "__ignored", (${markerTest}) AS "__marker" FROM ${quoteIdent(raw)} WHERE "__rn" > ${s.headerRow + s.skipRows}`,
    );
    // The first row that is not read, when a stop rule ends the table.
    let stopAtRow: number | null = null;
    if (stop.kind === 'row') stopAtRow = stop.row + 1;
    else if (stop.kind === 'marker') {
      stopAtRow = ((await runner.query(`SELECT min("__rn") FROM ${quoteIdent(rows)} WHERE "__marker"`)).rows[0]?.[0] as number | null) ?? null;
      if (stopAtRow === null) stats?.warnings?.push(warning('engine.inputStopNotFound', { text: stop.text, file: file.name, step: nodeId }, nodeId));
    }
    else if (stop.kind === 'blank_rows') {
      // The first row that starts a run of `count` empty rows (a row to ignore is not empty). Every line of the file counts: a
      // line that is not in the table is an empty line, so the lines are listed and joined to the rows.
      const hit = await runner.query(
        `SELECT min("rn") FROM (SELECT "rn", bool_and("is_blank") OVER w AS "run", count(*) OVER w AS "n" FROM (` +
          `SELECT g.g AS "rn", coalesce(r."__blank" AND NOT r."__ignored", TRUE) AS "is_blank" FROM ` +
          `generate_series(${s.headerRow + s.skipRows + 1}, (SELECT coalesce(max("__rn"), 0) FROM ${quoteIdent(rows)})) AS g(g) LEFT JOIN ${quoteIdent(rows)} r ON r."__rn" = g.g` +
          `) WINDOW w AS (ORDER BY "rn" ROWS BETWEEN CURRENT ROW AND ${stop.count - 1} FOLLOWING)) WHERE "run" AND "n" = ${stop.count}`,
      );
      stopAtRow = (hit.rows[0]?.[0] as number | null) ?? null;
    }
    const limit = stopAtRow === null ? '' : ` AND "__rn" < ${Number(stopAtRow)}`;
    const filled = (i: number) =>
      s.fillDown.includes(names[i]!)
        ? `last_value(${quoteIdent(`c${i}`)} IGNORE NULLS) OVER (ORDER BY "__rn" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`
        : quoteIdent(`c${i}`);
    const select = names.map((n, i) => `${filled(i)} AS ${quoteIdent(n)}`).join(', ');
    const rowNo = s.rowNumberColumn === undefined ? '' : `, "__rn" AS ${quoteIdent(s.rowNumberColumn)}`;
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(stage)} AS SELECT * FROM (` +
        `SELECT "__rn" AS "__rn_internal", ${select}${rowNo}, "__blank" FROM ${quoteIdent(rows)} WHERE NOT "__ignored"${limit}` +
        `) WHERE NOT "__blank" ORDER BY "__rn_internal"`,
    );
    const typeStats = await runner.query(
      `SELECT ${names
        .map((n, i) => {
          const id = quoteIdent(n);
          return (
            `count(${id}) AS n${i}, ` +
            `bool_and(${id} IS NULL OR regexp_full_match(${id}, '${CSV_NUMBER}')) AS num${i}, ` +
            `bool_and(${id} IS NULL OR (regexp_full_match(${id}, '${CSV_DATE}') AND TRY_CAST(${id} AS DATE) IS NOT NULL)) AS dt${i}`
          );
        })
        .join(', ')} FROM ${quoteIdent(stage)}`,
    );
    const row = typeStats.rows[0] ?? [];
    const columns: Column[] = names.map((name, i) => {
      const count = Number(row[i * 3] ?? 0);
      if (count === 0) return { name, type: 'text' };
      if (row[i * 3 + 1] === true) return { name, type: 'number' };
      if (row[i * 3 + 2] === true) return { name, type: 'date' };
      return { name, type: 'text' };
    });
    if (s.rowNumberColumn !== undefined) columns.push({ name: s.rowNumberColumn, type: 'number' });
    // The stage holds the internal columns too, so select only the final ones.
    const cols = columns.map((c) => c.name);
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(`${stage}2`)} AS SELECT ${cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(stage)} ORDER BY "__rn_internal"`,
    );
    await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(stage)}`);
    return await finalize(runner, `${stage}2`, relation, columns);
  } finally {
    await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(raw)}`);
    await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(rows)}`);
  }
}

/**
 * Reads one input file into a table. Checks the size guard first. xlsx is streamed row by row (decision D9),
 * csv is read by DuckDB `read_csv` (D10). Every cell is staged as text and cast to the column type afterwards,
 * so a text cell such as `2h` in a number column is never turned into NULL: such a column stays text.
 */
export async function loadInputFile(
  runner: SqlRunner,
  file: FileSource,
  settings: InputFileSettings,
  relation: string,
  nodeId = settings.key,
  stats?: LoadStats,
): Promise<LoadedTable> {
  const check = checkFileSize(file);
  if (!check.ok) {
    throw coded('file_too_large', 'engine.fileTooLarge', { fileName: file.name, size: megabytes(check.sizeBytes), limit: megabytes(check.limitBytes) }, nodeId);
  }
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  return isCsv ? loadCsv(runner, file, settings, relation, nodeId, stats) : loadXlsx(runner, file, settings, relation, nodeId, stats);
}
