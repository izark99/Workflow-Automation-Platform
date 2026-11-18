import type { FlowDefinition } from '../../engine/flow/types';
import { formatDate } from '../../engine/versions';
import type { PreparedRun, RefTable } from '../../engine/versions';
import type { FlowVersionRecord } from '../../store/types';
import { translate } from '../i18n';

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
