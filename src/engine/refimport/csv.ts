/** Reading a csv text into rows of text cells (no React, no Supabase). */

/** The delimiter of the first line: the one of comma, semicolon and tab that occurs most outside quotes (Excel in some regions saves with a semicolon). */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = ',';
  for (const d of [',', ';', '\t']) if ((counts[d] ?? 0) > (counts[best] ?? 0)) best = d;
  return best;
}

/**
 * Splits csv text into rows of cells. Handles a BOM, CRLF, CR and LF line ends, quoted cells with delimiters, line breaks
 * and doubled quotes. A last empty line is not a row. `maxRows` stops reading after that many rows.
 */
export function parseCsv(input: string, options: { maxRows?: number; delimiter?: string } = {}): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false; // a row has at least one character, so a trailing line end does not add an empty row

  const endCell = (): void => {
    row.push(cell);
    cell = '';
  };
  const endRow = (): void => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      started = true;
    } else if (ch === delimiter) {
      endCell();
      started = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
      started = true;
    }
  }
  if (started && rows.length < maxRows) endRow();
  return rows;
}
