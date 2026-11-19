import { readXlsx, XlsxReadError, type CellValue } from '../xlsx-stream';
import { requireColumn } from '../nodes/columns';
import { checkFileSize } from '../size-guard';
import { createTableStatement, insertRowsStatements, quoteIdent, quoteString } from '../sql';
import { megabytes } from '../messages';
import { coded, EngineError, type Cell, type Column, type ColumnType, type LoadedTable, type SqlRunner } from '../types';

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
  return {
    key: raw.key as string,
    sheet: text('sheet'),
    headerRow: int('headerRow', 1, 1),
    skipRows: int('skipRows', 0, 0),
    fillDown: fillDown as string[],
    rowNumberColumn: text('rowNumberColumn'),
  };
}

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
  if (s.rowNumberColumn !== undefined && names.includes(s.rowNumberColumn)) {
    throw new EngineError(
      'invalid_settings',
      `The file already has a column "${s.rowNumberColumn}". Choose another name for the row number column.`,
      nodeId,
    );
  }
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

async function loadXlsx(runner: SqlRunner, file: FileSource, s: InputFileSettings, relation: string, nodeId: string) {
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

  try {
    for await (const { row, cells } of readXlsx(file.blob, s.sheet === undefined ? {} : { sheetName: s.sheet })) {
      if (row < s.headerRow) continue;
      if (row === s.headerRow) {
        names = headerNames(cells, nodeId);
        checkSettingsAgainstHeader(names, s, nodeId);
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

      const values: (string | null)[] = names.map((_, i) => {
        const v = cells[i];
        return v === undefined || v === '' ? null : toText(v);
      });
      names.forEach((_, i) => {
        if (values[i] === null && fillIndexes.includes(i)) values[i] = last[i] ?? null;
      });
      if (names.every((_, i) => cells[i] === undefined || cells[i] === '')) continue;
      names.forEach((_, i) => {
        const raw = cells[i];
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
      throw new EngineError(
        'file_read_failed',
        `${file.name} has no data at header row ${s.headerRow}. Check the header row number in the step settings.`,
        nodeId,
      );
    }
    await flush();
  } catch (e) {
    await runner.exec(`DROP TABLE IF EXISTS ${quoteIdent(stage)}`);
    if (e instanceof XlsxReadError) throw new EngineError('file_read_failed', `${file.name}: ${e.message}`, nodeId);
    throw e;
  }
  const columns: Column[] = names.map((name, i) => ({ name, type: pickType(kinds[i]!) }));
  if (s.rowNumberColumn !== undefined) columns.push({ name: s.rowNumberColumn, type: 'number' });
  return finalize(runner, stage, relation, columns);
}

async function loadCsv(runner: SqlRunner, file: FileSource, s: InputFileSettings, relation: string, nodeId: string) {
  const raw = `${relation}_raw`;
  const stage = `${relation}_stage`;
  const virtualName = `${relation}.csv`;
  await runner.registerFile(virtualName, file.blob);
  try {
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(raw)} AS SELECT row_number() OVER () AS "__rn", * ` +
        `FROM read_csv(${quoteString(virtualName)}, header = false, all_varchar = true, null_padding = true, ignore_errors = false)`,
    );
    const head = await runner.query(`SELECT * EXCLUDE ("__rn") FROM ${quoteIdent(raw)} WHERE "__rn" = ${s.headerRow}`);
    const headCells = head.rows[0];
    if (!headCells) {
      throw new EngineError(
        'file_read_failed',
        `${file.name} has no data at header row ${s.headerRow}. Check the header row number in the step settings.`,
        nodeId,
      );
    }
    const names = headerNames(headCells, nodeId);
    checkSettingsAgainstHeader(names, s, nodeId);
    const src = (i: number) => quoteIdent(head.columns[i]!);
    const filled = (i: number) =>
      s.fillDown.includes(names[i]!)
        ? `last_value(NULLIF(${src(i)}, '') IGNORE NULLS) OVER (ORDER BY "__rn" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`
        : `NULLIF(${src(i)}, '')`;
    const select = names.map((n, i) => `${filled(i)} AS ${quoteIdent(n)}`).join(', ');
    const blank = names.map((_, i) => `NULLIF(${src(i)}, '') IS NULL`).join(' AND ');
    const rowNo = s.rowNumberColumn === undefined ? '' : `, "__rn" AS ${quoteIdent(s.rowNumberColumn)}`;
    await runner.exec(
      `CREATE OR REPLACE TABLE ${quoteIdent(stage)} AS SELECT * FROM (` +
        `SELECT "__rn" AS "__rn_internal", ${select}${rowNo}, ${blank || 'TRUE'} AS "__blank" FROM ${quoteIdent(raw)} WHERE "__rn" > ${s.headerRow + s.skipRows}` +
        `) WHERE NOT "__blank" ORDER BY "__rn_internal"`,
    );
    const stats = await runner.query(
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
    const row = stats.rows[0] ?? [];
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
): Promise<LoadedTable> {
  const check = checkFileSize(file);
  if (!check.ok) {
    throw coded('file_too_large', 'engine.fileTooLarge', { fileName: file.name, size: megabytes(check.sizeBytes), limit: megabytes(check.limitBytes) }, nodeId);
  }
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  return isCsv ? loadCsv(runner, file, settings, relation, nodeId) : loadXlsx(runner, file, settings, relation, nodeId);
}
