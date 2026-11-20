import { NO_MATCH } from '../nodes/lookup-join';
import { FUNCTIONS as PIVOT_FUNCTIONS } from '../nodes/pivot';
import type { NodeType } from './types';

// The settings of each step that can take a parameter (SPEC 13.3 item 2), and the short list of those that cannot.
// A setting is in exactly one of the two lists; `bindable.test.ts` reads the source of every node module and fails for a
// setting that the module reads and that is in neither list, so a new setting cannot be forgotten.

export type BindableType = 'text' | 'number' | 'date' | 'boolean' | 'choice';

export interface BindableSetting {
  name: string;
  type: BindableType;
  /** For `choice`: the fixed choices. A parameter value must be one of them. */
  choices?: readonly string[];
  /** A whole number (for `number`). */
  integer?: boolean;
  /** The smallest value (for `number`). */
  min?: number;
  /** The setting may be left unset; a blank optional parameter then leaves it unset. */
  optional: boolean;
}

const text = (name: string, optional: boolean): BindableSetting => ({ name, type: 'text', optional });
const whole = (name: string, min: number): BindableSetting => ({ name, type: 'number', integer: true, min, optional: true });
const choice = (name: string, choices: readonly string[], optional: boolean): BindableSetting => ({ name, type: 'choice', choices, optional });

export const BINDABLE_SETTINGS: Readonly<Record<NodeType, readonly BindableSetting[]>> = {
  input_file: [text('sheet', true), whole('headerRow', 1), whole('skipRows', 0), text('rowNumberColumn', true)],
  reference_table: [],
  column_mapping: [],
  filter: [],
  formula_column: [text('name', false)],
  lookup_join: [choice('onNoMatch', NO_MATCH, true)],
  group_by: [],
  unpivot: [text('nameColumn', false), text('valueColumn', false), { name: 'skipBlank', type: 'boolean', optional: true }],
  pivot: [
    choice('aggregation', PIVOT_FUNCTIONS, false),
    { name: 'fill', type: 'number', optional: true },
    text('namePrefix', true),
    text('nameSuffix', true),
    choice('nameCase', ['keep', 'lower', 'upper'], true),
  ],
  append: [choice('match', ['name', 'position'], true)],
  output: [text('file', true), choice('format', ['xlsx', 'csv'], true), text('sheet', false)],
  sql: [],
};

/** Settings that never take a parameter, with the reason. */
export const NOT_BINDABLE_SETTINGS: Readonly<Record<NodeType, Readonly<Record<string, string>>>> = {
  input_file: { key: 'The name of the file slot: the Run screen asks for one file per key before any parameter has a value.', fillDown: 'A list of columns of the data.' },
  reference_table: { table: 'The name of the table. The flow must name it when it is saved: what a person may read depends on it (SPEC 12.1).' },
  column_mapping: { columns: 'The rows of a grid.' },
  filter: { condition: 'A formula. Use PARAM("key").' },
  formula_column: { expression: 'A formula. Use PARAM("key").' },
  lookup_join: { source: 'A choice of a step or a table with its own settings.', keys: 'The rows of a list of columns.', bring: 'The rows of a list of columns.' },
  group_by: { groupBy: 'A list of columns of the data.', aggregations: 'The rows of a list.' },
  pivot: { rowKeys: 'A list of columns of the data.', columnSource: 'A column of the data.', value: 'A column of the data.', columns: 'Where the new columns come from, with its own settings.' },
  unpivot: { keep: 'A list of columns of the data.', unpivot: 'A list of columns of the data.' },
  append: {},
  output: { columns: 'A list of columns of the data.', numberLikeText: 'A list of columns of the data.', sort: 'The rows of a list.' },
  sql: { sql: 'SQL. Read parameters from the table params.' },
};

export function bindableSetting(type: NodeType, name: string): BindableSetting | undefined {
  return BINDABLE_SETTINGS[type].find((s) => s.name === name);
}

export const isBindable = (type: NodeType, name: string): boolean => bindableSetting(type, name) !== undefined;
