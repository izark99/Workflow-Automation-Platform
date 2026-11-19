import type { ColumnType } from '../types';
import type { EngineMessageId, MessageParams } from '../messages';

/** The limits of a reference table (SPEC 12.1 item 4). */
export const MAX_IMPORT_ROWS = 50_000;
export const MAX_IMPORT_COLUMNS = 100;
/** The type of a column is guessed from this many filled cells. */
export const GUESS_CELLS = 1000;

export type RawCell = string | number | boolean | Date | null;

/** The cells of one sheet or csv file as the file holds them. `rows[0]` is row 1 of the sheet. */
export interface Grid {
  rows: RawCell[][];
  /** True for xlsx: cells carry their own types. A csv cell is always text. */
  typed: boolean;
  /** True when reading stopped at the row limit asked for, so there are more rows in the file. */
  truncated: boolean;
}

export interface ImportColumn {
  name: string;
  type: ColumnType;
}

/** A problem of the file, with the catalog id of its text. Row and column are in the parameters of the message. */
export interface ImportProblem {
  messageId: EngineMessageId;
  params: MessageParams;
}
