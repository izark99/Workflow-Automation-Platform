import { translate } from './i18n';
import { versionRange } from './builder/forms/reference-table-logic';
import type { TableGap } from '../engine/versions';

/** One line of the date check: "{table} has no published version from {date} to {date}: a run for these dates will stop." */
export const gapLine = (gap: TableGap): string => translate('dateCheck.gap', { table: gap.table, range: versionRange(gap.from, gap.to) });
