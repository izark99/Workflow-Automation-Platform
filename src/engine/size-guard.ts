// Size guard: a file above the measured safe size is refused before any parsing starts.
// Only xlsx needs it. A csv file is read by DuckDB from the file handle without loading it
// into the page (spike: 378 MB csv, 1.1 GB peak).

/**
 * Size in bytes of the largest xlsx that loaded in the spike (docs/SPIKE_RESULTS.md,
 * `xlsx-stream`, 1,048,576 rows x 40 columns, peak memory 1,122 MB). A unit test fails
 * when this value is above the largest size in docs/spike-raw.json.
 */
export const MAX_SAFE_XLSX_BYTES = 300_002_342;

export type SizeCheck = { ok: true } | { ok: false; sizeBytes: number; limitBytes: number };

const XLSX_EXTENSION = /\.xls[xm]$/i;

export function checkFileSize(file: { name: string; size: number }): SizeCheck {
  if (XLSX_EXTENSION.test(file.name) && file.size > MAX_SAFE_XLSX_BYTES) {
    return { ok: false, sizeBytes: file.size, limitBytes: MAX_SAFE_XLSX_BYTES };
  }
  return { ok: true };
}
