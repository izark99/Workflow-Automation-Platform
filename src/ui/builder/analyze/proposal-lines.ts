import { columnLetters } from '../../../engine/input/region';
import type { StopRule } from '../../../engine/input/region';
import type { Confidence, Proposed, Reason } from '../../../engine/layout';
import { translate } from '../../i18n';
import type { MessageKey } from '../../i18n';
import type { FileAnalysis } from './analyze-file';

export type ProposalLineId = 'sheet' | 'headerRow' | 'firstColumn' | 'lastColumn' | 'stopAt' | 'expect' | 'fillDown' | 'ignoreRows';

/** One line of the result of the analysis: a setting, its proposed value, how sure the analysis is, and why. */
export interface ProposalLine {
  id: ProposalLineId;
  label: string;
  /** The value in words, or undefined when the analysis could not decide. */
  value: string | undefined;
  confidence?: Confidence;
  /** The reason, in words, for the info button. */
  reason?: string;
}

const LABELS: Record<ProposalLineId, MessageKey> = {
  sheet: 'builder.form.input.sheet',
  headerRow: 'builder.form.input.headerRow',
  firstColumn: 'builder.form.input.firstColumn',
  lastColumn: 'builder.form.input.lastColumn',
  stopAt: 'builder.form.input.stopAt',
  expect: 'builder.form.input.expect',
  fillDown: 'builder.form.input.fillDown',
  ignoreRows: 'builder.form.input.ignoreRows',
};

const reasonText = (r: Reason): string => translate(r.id as MessageKey, r.params);

/** A stop rule in words. */
export function stopText(stop: StopRule): string {
  switch (stop.kind) {
    case 'end':
      return translate('builder.form.input.stop.end');
    case 'blank_rows':
      return stop.count > 1 ? translate('builder.analyze.stopBlankMore', { n: stop.count }) : translate('builder.analyze.stopBlank');
    case 'row':
      return translate('builder.analyze.stopRow', { row: stop.row });
    case 'marker': {
      const match = translate(`builder.analyze.match.${stop.match}` as MessageKey);
      return stop.column === undefined
        ? translate('builder.analyze.stopMarker', { match, text: stop.text })
        : translate('builder.analyze.stopMarkerColumn', { match, text: stop.text, column: stop.column });
    }
  }
}

const line = <T>(id: ProposalLineId, p: Proposed<T> | undefined, text: (v: T) => string): ProposalLine => ({
  id,
  label: translate(LABELS[id]),
  value: p === undefined ? undefined : text(p.value),
  ...(p === undefined ? {} : { confidence: p.confidence, reason: reasonText(p.reason) }),
});

/**
 * The lines of the result, in the order of the design: the sheet (an xlsx file only), the header row, the first and last
 * column, where to stop, the columns the file must have, the columns to fill down, and the rows to ignore when there are any.
 * A line with no value says that the analysis could not decide. Empty when no table was found.
 */
export function proposalLines(result: FileAnalysis): ProposalLine[] {
  const a = result.analysis;
  if (!a.found) return [];
  const none = translate('builder.analyze.none');
  const lines: ProposalLine[] = [];
  if (result.sheets.length > 0) lines.push(line('sheet', result.sheet, (v) => v));
  lines.push(
    line('headerRow', a.headerRow, (v) => String(v)),
    line('firstColumn', a.firstColumn, (v) => columnLetters(v)),
    line('lastColumn', a.lastColumn, (v) => columnLetters(v)),
    line('stopAt', a.stopAt, stopText),
    line('expect', a.expect, (v) => (v.length > 0 ? v.join(', ') : none)),
  );
  // Nothing found to fill down is an answer, not a doubt.
  lines.push(a.fillDown ? line('fillDown', a.fillDown, (v) => v.join(', ')) : { id: 'fillDown', label: translate(LABELS.fillDown), value: none });
  if (a.ignoreRows) lines.push(line('ignoreRows', a.ignoreRows, (v) => v.map((r) => `${r.column}: ${r.text}`).join('; ')));
  return lines;
}
