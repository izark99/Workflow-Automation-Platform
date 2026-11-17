export type Strategy = 'sheetjs-whole' | 'xlsx-stream' | 'duckdb-csv';

export interface BenchRequest {
  file: File;
  strategy: Strategy;
}

export type BenchResponse =
  | { ok: true; strategy: Strategy; fileName: string; rows: number; columns: number; groups: number; loadMs: number; queryMs: number }
  | { ok: false; strategy: Strategy; fileName: string; error: string };

export const GROUP_QUERY =
  'SELECT group_key, count(*)::INTEGER AS n, sum(num_1) AS s, avg(num_2) AS a FROM bench GROUP BY group_key ORDER BY group_key';
