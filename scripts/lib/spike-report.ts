// Renders docs/SPIKE_RESULTS.md from the raw run records. The strategy choice is a rule
// over the numbers, so the file can be regenerated on every run without hand edits.
import { BENCH_SIZES } from './bench-data.ts';
import type { RawResults, RunRecord, SpikeStrategy } from './spike-runner.ts';

type Format = 'xlsx' | 'csv';

const STRATEGY_TEXT: Record<SpikeStrategy, string> = {
  'sheetjs-whole':
    'SheetJS parses the whole workbook or csv text in memory (`read` with dense mode), then rows go to DuckDB as Arrow chunks of 50,000 rows.',
  'xlsx-stream':
    'Own streaming reader (`src/engine/xlsx-stream/`): unzips one part at a time with `DecompressionStream`, parses the sheet XML in chunks, and sends Arrow chunks of 50,000 rows to DuckDB. xlsx only.',
  'duckdb-csv': 'DuckDB reads the csv file handle directly with `read_csv`. csv only.',
};

const usable = (r: RunRecord): boolean => r.status === 'ok' && r.rowsMatch !== false;
const fmtNum = (n: number): string => n.toLocaleString('en-US');
const sec = (ms: number | undefined): string => (ms === undefined ? '-' : (ms / 1000).toFixed(1));

export interface Choice {
  strategy: SpikeStrategy;
  okCount: number;
  total: number;
  totalLoadMs: number;
}

/**
 * Rule: the strategy that finishes (status ok and the right row count) at the most sizes.
 * A tie goes to the lower total load time over its finished runs.
 */
export function chooseStrategy(runs: RunRecord[], format: Format): Choice | undefined {
  const byStrategy = new Map<SpikeStrategy, RunRecord[]>();
  for (const r of runs) {
    if (r.format !== format) continue;
    byStrategy.set(r.strategy, [...(byStrategy.get(r.strategy) ?? []), r]);
  }
  const choices: Choice[] = [...byStrategy].map(([strategy, rs]) => {
    const ok = rs.filter(usable);
    return {
      strategy,
      okCount: ok.length,
      total: rs.length,
      totalLoadMs: ok.reduce((sum, r) => sum + (r.loadMs ?? 0), 0),
    };
  });
  choices.sort((a, b) => b.okCount - a.okCount || a.totalLoadMs - b.totalLoadMs || a.strategy.localeCompare(b.strategy));
  return choices[0];
}

function survived(r: RunRecord): string {
  if (r.status === 'crashed') return 'no';
  if (r.status === 'timeout') return 'unknown';
  return 'yes';
}

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function runRow(r: RunRecord, withStrategy: boolean): string {
  const cells = [r.file, r.format, fmtNum(r.totalRows), String(r.fileMb)];
  if (withStrategy) cells.push(`\`${r.strategy}\``);
  cells.push(r.status, sec(r.loadMs), String(r.peakRssMb), r.queryMs === undefined ? '-' : String(r.queryMs), survived(r));
  return row(cells);
}

const HEAD = ['File', 'Format', 'Rows', 'File MB', 'Strategy', 'Status', 'Load s', 'Peak memory MB', 'Group-by ms', 'Tab survived'];

function table(head: string[], rows: string[]): string[] {
  return [row(head), row(head.map(() => '---')), ...rows];
}

function chosenLine(format: Format, c: Choice | undefined): string {
  if (!c) return `Chosen ${format} reading strategy: none, no ${format} run finished.`;
  return (
    `Chosen ${format} reading strategy: \`${c.strategy}\`. It finished ${c.okCount} of ${c.total} runs` +
    (c.okCount > 0 ? ` with a total load time of ${sec(c.totalLoadMs)} s.` : '.')
  );
}

function targets(runs: RunRecord[], xlsx: Choice | undefined, csv: Choice | undefined): string[] {
  const find = (c: Choice | undefined, format: Format, rows: number) =>
    c ? runs.find((r) => r.format === format && r.strategy === c.strategy && r.totalRows === rows) : undefined;
  const out: string[] = [];
  const small = find(xlsx, 'xlsx', BENCH_SIZES[0]);
  const mid = find(xlsx, 'xlsx', BENCH_SIZES[1]);
  if (xlsx && small && mid && usable(small) && usable(mid) && small.loadMs !== undefined && mid.loadMs !== undefined) {
    const est = small.loadMs + ((mid.loadMs - small.loadMs) * (200_000 - BENCH_SIZES[0])) / (BENCH_SIZES[1] - BENCH_SIZES[0]);
    out.push(
      `- A 200,000-row xlsx loads in under 30 s: not measured directly. Linear estimate between the 100,000-row (${sec(small.loadMs)} s) ` +
        `and 500,000-row (${sec(mid.loadMs)} s) runs of \`${xlsx.strategy}\`: ${sec(est)} s. ${est < 30_000 ? 'Met' : 'Not met'} (estimate).`,
    );
  } else {
    out.push('- A 200,000-row xlsx loads in under 30 s: cannot be estimated, the 100,000-row and 500,000-row runs of the chosen strategy did not both finish.');
  }
  const csvMax = find(csv, 'csv', BENCH_SIZES[2]);
  out.push(
    csvMax
      ? `- A csv file at the full row limit loads without a crash: ${usable(csvMax) ? 'met' : 'not met'} (\`${csvMax.strategy}\`, status ${csvMax.status}, ${sec(csvMax.loadMs)} s).`
      : '- A csv file at the full row limit loads without a crash: not run.',
  );
  const xlsxMax = find(xlsx, 'xlsx', BENCH_SIZES[2]);
  if (!xlsxMax) out.push('- xlsx at the full row limit: not run.');
  else if (usable(xlsxMax)) {
    out.push(`- xlsx at the full row limit: loaded with \`${xlsxMax.strategy}\` in ${sec(xlsxMax.loadMs)} s, peak ${xlsxMax.peakRssMb} MB. The "save as csv" warning is still needed above the measured size.`);
  } else {
    out.push(`- xlsx at the full row limit: failed with \`${xlsxMax.strategy}\` (status ${xlsxMax.status}). The app must show the "save as csv" warning instead of loading.`);
  }
  if (xlsx) {
    const rs = runs.filter((r) => r.format === 'xlsx' && r.strategy === xlsx.strategy);
    const okMb = rs.filter(usable).map((r) => r.fileMb);
    const failMb = rs.filter((r) => !usable(r)).map((r) => r.fileMb);
    out.push(
      `- Size guard input for T0.5: largest xlsx that loaded with \`${xlsx.strategy}\`: ${okMb.length ? `${Math.max(...okMb)} MB` : 'none'}; ` +
        `smallest that failed: ${failMb.length ? `${Math.min(...failMb)} MB` : 'none'}.`,
    );
  }
  return out;
}

export function renderSpikeReport(raw: RawResults): string {
  const { runs } = raw;
  const xlsx = chooseStrategy(runs, 'xlsx');
  const csv = chooseStrategy(runs, 'csv');
  const lines: string[] = [
    '# Spike results',
    '',
    'Written by `npm run spike` from `docs/spike-raw.json`. Do not edit by hand: the next run overwrites this file.',
    '',
    `Machine: ${raw.browser} (headless), Node ${raw.node}, ${raw.cpus} vCPUs, ${raw.ramGb} GB RAM. Each run uses a production build and a fresh browser.`,
    '',
    'Peak memory is the highest resident size of the browser renderer process (kernel `VmHWM`), which holds the page, the file bytes and DuckDB-WASM. ' +
      'Load time covers reading the file and creating the DuckDB table. Group-by is one query that counts, sums and averages over 200 group keys. ' +
      'Row counts of 1,048,576 include the header row.',
    '',
    '## Chosen reading strategies',
    '',
    chosenLine('xlsx', xlsx),
    '',
    chosenLine('csv', csv),
    '',
    'Rule: the strategy that finishes, with the right row count, at the most file sizes. A tie goes to the lower total load time.',
    '',
    '## Six measurements',
    '',
    'Each row shows the chosen strategy of its format.',
    '',
  ];
  const six: string[] = [];
  for (const format of ['xlsx', 'csv'] as const) {
    const choice = format === 'xlsx' ? xlsx : csv;
    for (const size of BENCH_SIZES) {
      const r = choice && runs.find((x) => x.format === format && x.strategy === choice.strategy && x.totalRows === size);
      six.push(r ? runRow(r, true) : row([`rows-${size}.${format}`, format, fmtNum(size), '-', '-', 'not run', '-', '-', '-', '-']));
    }
  }
  lines.push(...table(HEAD, six), '', '## Targets from SPEC section 8', '', ...targets(runs, xlsx, csv), '', '## Strategies', '');
  for (const s of new Set(runs.map((r) => r.strategy))) lines.push(`- \`${s}\`: ${STRATEGY_TEXT[s]}`);
  lines.push('', '## All runs', '', ...table(HEAD, runs.map((r) => runRow(r, true))), '');
  const failed = runs.filter((r) => r.status !== 'ok' || r.rowsMatch === false);
  if (failed.length > 0) {
    lines.push('## Failures', '');
    for (const r of failed) {
      const why = r.error ?? (r.rowsMatch === false ? `row count ${r.rows} does not match the file` : 'no message');
      lines.push(`- ${r.file} with \`${r.strategy}\`: ${r.status}. ${why}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
