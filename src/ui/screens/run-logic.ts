import type { FlowDefinition } from '../../engine/flow/types';
import { dateCheck, resolveVersion } from '../../engine/versions';
import type { FlowVersion, PreparedRun, RefTable, TableGap } from '../../engine/versions';
import type { FlowVersionRecord } from '../../store/types';
import { translate, formatDate } from '../i18n';

export interface RunInput {
  stepId: string;
  label: string;
  /** The logical key that the run reads the file under. */
  key: string;
}

/** The files a run needs: one for each Input file step (a key used twice is asked once). */
export function inputsOf(def: FlowDefinition): RunInput[] {
  const seen = new Set<string>();
  const out: RunInput[] = [];
  for (const n of def.nodes) {
    if (n.type !== 'input_file') continue;
    const key = typeof n.settings.key === 'string' ? n.settings.key : '';
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push({ stepId: n.id, label: n.label ?? n.id, key });
  }
  return out;
}

export const progressText = (started: number, total: number, label: string): string => translate('run.progressText', { started, total, label });

/** `12 KB`, `3.4 MB`: for the file rows. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1000) return translate('common.size.bytes', { n: bytes });
  if (bytes < 1_000_000) return translate('common.size.kilobytes', { n: Math.round(bytes / 1000) });
  return translate('common.size.megabytes', { n: (bytes / 1e6).toFixed(1) });
}

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');
const range = (v: { validFrom: string; validTo: string | null }): string =>
  v.validTo === null ? translate('flows.range.from', { from: two(v.validFrom) }) : translate('flows.range.between', { from: two(v.validFrom), to: two(v.validTo) });

export interface VersionRow {
  name: string;
  range: string;
}

/** "Versions used for this date": the flow version and the version of each reference table that the flow reads. */
export function versionRows(prepared: PreparedRun, flowName: string, flowVersions: FlowVersionRecord[], refTables: RefTable[]): VersionRow[] {
  const flow = flowVersions.find((v) => v.versionNo === prepared.resolved.flow);
  const rows: VersionRow[] = [{ name: translate('run.versionName', { name: flowName, n: prepared.resolved.flow }), range: flow ? range(flow) : '' }];
  for (const [table, no] of Object.entries(prepared.resolved.refTables)) {
    const v = refTables.find((t) => t.name === table)?.versions.find((x) => x.versionNo === no);
    rows.push({ name: translate('run.versionName', { name: table, n: no }), range: v ? range(v) : '' });
  }
  return rows;
}

export const sheetLabel = (sheet: string, rows: number): string => translate('run.sheetLabel', { sheet, rows, rowsText: rows.toLocaleString('en-US') });

/**
 * The date check of the Run screen (SPEC 13.3 item 7): the days of the flow version that the effective date uses for which a
 * table that the flow reads has no published version. It is the check of the publish dialog, over the range of this version.
 * When the date itself is in a gap the run stops with its own message, and the gap is still listed here. A table with no
 * version at all is left out for a person who may not read it yet (the database hides its versions), and counts for the admin.
 */
export function runDateCheck(flowVersions: FlowVersion[], date: string, tables: RefTable[], isAdmin: boolean): TableGap[] {
  try {
    const v = resolveVersion(flowVersions, date, { what: 'flow' });
    return dateCheck(v.definition, { validFrom: v.validFrom, validTo: v.validTo }, tables, { skipEmpty: !isAdmin });
  } catch {
    return []; // no usable flow version: the screen already says so
  }
}
