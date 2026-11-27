import type { NodeType } from '../../engine/flow/types';
import type { IconName } from '../components';

/**
 * The icon of each step type, all from the Harold set (never from the icons drawn for Phase 8, D128). The set has no icon for
 * some of the steps, so the nearest one is used: `chevrons-up-down` for Sort (the set has no arrow-up-down), `circle-check` for
 * Check (no shield-check) and `chart-column` for Compare. `step-icons.test.ts` keeps the set closed.
 */
export const STEP_ICONS: Readonly<Record<NodeType, IconName>> = {
  input_file: 'upload',
  reference_table: 'file-spreadsheet',
  output: 'download',
  column_mapping: 'menu',
  filter: 'filter',
  formula_column: 'pencil',
  unpivot: 'arrow-down',
  pivot: 'arrow-up',
  group_by: 'chart-column',
  lookup_join: 'search',
  append: 'plus',
  sql: 'settings',
  sort: 'chevrons-up-down',
  dedupe: 'copy',
  top_n: 'trending-up',
  split_column: 'list-filter',
  clean_text: 'refresh-cw',
  check: 'circle-check',
  compare: 'chart-column',
};
