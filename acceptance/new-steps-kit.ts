import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { compareWorkbooks, formatComparison, readWorkbook } from '../scripts/lib/compare-workbooks';
import { xlsxBytes } from '../scripts/lib/refimport-fixtures';
import type { FixtureCell } from '../scripts/lib/refimport-fixtures';
import type { RunReply } from './page';

// G1 of Phase 8 (SPEC 15.6): a generated flow for each new step runs through the real engine in Chromium, and the workbook
// it writes must equal the rows that the test computes with a plain loop. Nothing here reads `testcase/`.

/** A small deterministic random generator (LCG), so that a failure repeats. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

/** A csv file. A null cell is written empty. A cell with a comma, a quote or a line break is quoted. */
export function csvOf(columns: string[], rows: FixtureCell[][]): string {
  const cell = (v: FixtureCell): string => {
    if (v === null) return '';
    const text = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${[columns, ...rows].map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

export interface Generated {
  /** The steps between the input steps and the output steps. */
  nodes: unknown[];
  edges: unknown[];
  /** Input files by key. */
  files: Record<string, { name: string; text: string }>;
  /** The Input steps, by key. */
  inputs: string[];
  /** The Output steps: the sheet name, the node and handle that feed it. */
  outputs: { sheet: string; from: string; handle?: string; /** The print layout of the sheet (SPEC 16.1). Needs schemaVersion 5. */ print?: unknown }[];
  /** The parameters of the flow, and their values for this run. */
  parameters?: unknown[];
  parameterValues?: Record<string, unknown>;
}

/** Runs a generated flow: one Input file step per key, the given steps, one Output step per sheet, all in one workbook. */
export async function runGenerated(page: Page, g: Generated): Promise<RunReply> {
  await page.goto('/acceptance/index.html');
  await page.waitForFunction(() => typeof window.runDataset === 'function');
  const nodes = [
    ...g.inputs.map((key) => ({ id: `in_${key}`, type: 'input_file', settings: { key, headerRow: 1 } })),
    ...g.nodes,
    ...g.outputs.map((o) => ({ id: `out_${o.sheet}`, type: 'output', settings: { file: 'Result', format: 'xlsx', sheet: o.sheet, ...(o.print ? { print: o.print } : {}) } })),
  ];
  const edges = [...g.edges, ...g.outputs.map((o) => ({ source: o.from, ...(o.handle ? { sourceHandle: o.handle } : {}), target: `out_${o.sheet}` }))];
  const files: Record<string, { name: string; base64: string }> = {};
  for (const [key, f] of Object.entries(g.files)) files[key] = { name: f.name, base64: Buffer.from(f.text).toString('base64') };
  const flow = { schemaVersion: g.outputs.some((o) => o.print) ? 5 : 4, ...(g.parameters ? { parameters: g.parameters } : {}), nodes, edges };
  return page.evaluate((a) => window.runDataset(a), { flow, effectiveDate: '2026-09-30', files, ...(g.parameterValues ? { parameterValues: g.parameterValues } : {}) } as never);
}

export interface ExpectedSheet {
  name: string;
  columns: string[];
  rows: FixtureCell[][];
}

/** Compares the workbook of the reply with the expected sheets, cell by cell. Dates are written as ISO texts in `rows`. */
export function expectWorkbook(reply: RunReply, sheets: ExpectedSheet[]): void {
  if (!reply.ok) throw new Error(`The engine stopped (${reply.code}): ${reply.message}`);
  expect(reply.files.map((f) => f.name)).toEqual(['Result.xlsx']);
  const actual = readWorkbook(new Uint8Array(Buffer.from(reply.files[0]!.base64, 'base64')));
  const expected = readWorkbook(
    new Uint8Array(
      xlsxBytes(
        sheets.map((s) => ({
          name: s.name,
          rows: [s.columns, ...s.rows.map((r) => r.map((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : v)))],
        })),
      ),
    ),
  );
  const comparison = compareWorkbooks(expected, actual, sheets.map((s) => s.name));
  expect(comparison.ok, formatComparison(comparison)).toBe(true);
  const total = sheets.reduce((n, s) => n + (s.rows.length + 1) * s.columns.length, 0);
  // Empty cells are not counted by the comparison, so it is at least the cells that hold a value.
  expect(comparison.comparedCells).toBeGreaterThan(0);
  expect(comparison.comparedCells).toBeLessThanOrEqual(total);
}
