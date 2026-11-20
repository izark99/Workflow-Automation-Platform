import { analyzeLayout, chooseSheet, MAX_ANALYZE_ROWS, proposalToSettings } from '../../../engine/layout';
import type { LayoutAnalysis, Proposed } from '../../../engine/layout';
import { listSheets, readGrid } from '../../../engine/refimport';
import type { Grid } from '../../../engine/refimport/types';
import { boundNames } from '../parameter-control/bindings-edit';

// The analysis of a sample file for the Input step (SPEC 13.2 item 3). It runs in the browser on the file that the person
// chose as a test file, reads it (a sheet at a time), proposes settings, and keeps nothing: only the settings that the person
// applies are saved with the flow.

/** The most sheets that are looked at when the first one holds no table. */
export const MAX_SHEETS = 20;

export interface FileAnalysis {
  /** The sheet that was chosen (xlsx). Absent for a csv file, which has no sheets. */
  sheet?: Proposed<string>;
  sheets: string[];
  analysis: LayoutAnalysis;
  /** The cells of the sheet that the analysis looked at, for the preview. */
  grid: Grid;
}

export type NamedBlob = Blob & { name: string };

/**
 * Reads the file and analyses it. For an xlsx file the first sheet is analysed; when it holds no table the other sheets are
 * too, and the one with the largest table is chosen. Returns `'cancelled'` when the signal is aborted, so a slow read can be
 * left. A file that cannot be read throws an error whose message says what to do.
 */
export async function analyzeFile(file: NamedBlob, options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<FileAnalysis | 'cancelled'> {
  const { signal, onProgress } = options;
  const sheets = await listSheets(file);
  if (signal?.aborted) return 'cancelled';
  const total = Math.max(1, Math.min(sheets.length, MAX_SHEETS));
  onProgress?.(0, total);
  if (sheets.length === 0) {
    const grid = await readGrid(file, { maxRows: MAX_ANALYZE_ROWS + 1 });
    if (signal?.aborted) return 'cancelled';
    return { sheets, analysis: analyzeLayout(grid), grid };
  }
  const candidates: { sheet: string; analysis: LayoutAnalysis; grid: Grid }[] = [];
  for (const sheet of sheets.slice(0, MAX_SHEETS)) {
    const grid = await readGrid(file, { sheet, maxRows: MAX_ANALYZE_ROWS + 1 });
    if (signal?.aborted) return 'cancelled';
    candidates.push({ sheet, analysis: analyzeLayout(grid), grid });
    onProgress?.(candidates.length, total);
    // The first sheet with a table is the one to read: the others are not looked at.
    if (candidates.length === 1 && candidates[0]!.analysis.found) break;
  }
  const chosen = chooseSheet(candidates);
  const pick = candidates.find((c) => c.sheet === chosen?.value) ?? candidates[0]!;
  return { sheet: chosen, sheets, analysis: pick.analysis, grid: pick.grid };
}

/** The settings that a proposal sets (the others of the step are not touched). */
const REGION_KEYS = ['sheet', 'headerRow', 'firstColumn', 'lastColumn', 'stopAt', 'expect', 'fillDown', 'ignoreRows'] as const;

/**
 * The settings of a step with the proposal written over its region settings. What the proposal leaves out is a default, so it
 * is removed from the step; a setting that uses a parameter keeps it, and every other setting of the step (the key, the rows
 * to skip, the row number column) is kept. When no table was found nothing changes.
 */
export function applyProposal(settings: Record<string, unknown>, result: Pick<FileAnalysis, 'sheet' | 'analysis'>): Record<string, unknown> {
  if (!result.analysis.found) return settings;
  const bound = new Set(boundNames(settings));
  const out = { ...settings };
  for (const key of REGION_KEYS) if (!bound.has(key)) delete out[key];
  const proposed = { ...(result.sheet ? { sheet: result.sheet.value } : {}), ...proposalToSettings(result.analysis) };
  for (const [key, value] of Object.entries(proposed)) if (!bound.has(key)) out[key] = value;
  return out;
}
