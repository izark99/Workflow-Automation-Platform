import { coded, EngineError, type Cell, type Column, type TableData } from './types';

/** The validity of one version. Dates are ISO text. `validTo: null` means the version is still in effect. */
export interface VersionRange {
  versionNo: number;
  validFrom: string;
  validTo: string | null;
  /** A draft never takes effect in a run unless asked. Missing means published. */
  status?: 'draft' | 'published';
}

export interface FlowVersion extends VersionRange {
  /** The flow definition JSON of this version. */
  definition: unknown;
}

export interface RefTableVersion extends VersionRange {
  columns: Column[];
  rows: Cell[][];
}

export interface RefTable {
  name: string;
  versions: RefTableVersion[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** True for a real calendar date written as 2026-09-30. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A date as the screens show it: `30 Sep 2026`. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

const describeRange = (v: VersionRange) =>
  v.validTo === null ? `from ${formatDate(v.validFrom)}` : `${formatDate(v.validFrom)} to ${formatDate(v.validTo)}`;

const covers = (v: VersionRange, date: string) => v.validFrom <= date && (v.validTo === null || date <= v.validTo);

function checkRanges(versions: VersionRange[], what: string): void {
  for (const v of versions) {
    if (!isIsoDate(v.validFrom) || (v.validTo !== null && !isIsoDate(v.validTo))) {
      throw coded('invalid_versions', 'engine.versionDateInvalid', { n: v.versionNo, what });
    }
    if (v.validTo !== null && v.validTo < v.validFrom) {
      throw coded('invalid_versions', 'engine.versionEndsBeforeStart', { n: v.versionNo, what, end: formatDate(v.validTo), start: formatDate(v.validFrom) });
    }
  }
}

/**
 * Picks the one version whose range holds the date (both ends included). It never picks the nearest version:
 * when none covers the date it throws a message that lists the periods that exist. See SPEC section 4.
 */
export function resolveVersion<T extends VersionRange>(
  versions: T[],
  effectiveDate: string,
  options: { what: string; includeDrafts?: boolean },
): T {
  const { what } = options;
  if (!isIsoDate(effectiveDate)) {
    throw coded('invalid_versions', 'engine.effectiveDateInvalid', { date: effectiveDate });
  }
  checkRanges(versions, what);
  const isDraft = (v: VersionRange) => v.status === 'draft';
  const usable = versions.filter((v) => !isDraft(v) || options.includeDrafts);
  const hits = usable.filter((v) => covers(v, effectiveDate));
  if (hits.length > 1) {
    throw coded('invalid_versions', 'engine.versionsOverlap', { numbers: hits.map((v) => v.versionNo).join(' and '), what, date: formatDate(effectiveDate) });
  }
  if (hits.length === 1) return hits[0]!;

  const published = versions.filter((v) => !isDraft(v));
  if (published.length === 0) {
    throw coded('no_version', 'engine.noPublishedVersion', { what, date: formatDate(effectiveDate) });
  }
  const draft = versions.find((v) => isDraft(v) && covers(v, effectiveDate));
  if (draft) {
    throw coded('no_version', 'engine.onlyDraftCovers', { n: draft.versionNo, what, date: formatDate(effectiveDate) });
  }
  const periods = [...published].sort((a, b) => a.validFrom.localeCompare(b.validFrom)).map((v) => `version ${v.versionNo}: ${describeRange(v)}`);
  throw coded('no_version', 'engine.noVersionValid', { what, date: formatDate(effectiveDate), periods: periods.join('; ') });
}

/** Pairs of version numbers whose ranges share at least one day. Used to refuse overlapping versions. */
export function findOverlaps(versions: VersionRange[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < versions.length; i++) {
    for (let j = i + 1; j < versions.length; j++) {
      const a = versions[i]!;
      const b = versions[j]!;
      const aEndsBeforeB = a.validTo !== null && a.validTo < b.validFrom;
      const bEndsBeforeA = b.validTo !== null && b.validTo < a.validFrom;
      if (!aEndsBeforeB && !bEndsBeforeA) pairs.push([a.versionNo, b.versionNo]);
    }
  }
  return pairs;
}

/** Names of the reference tables that Lookup and Pivot steps of a flow definition read, once each. */
export function referencedTables(definition: unknown): string[] {
  const names = new Set<string>();
  const nodes = (definition as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) return [];
  for (const node of nodes as { type?: unknown; settings?: Record<string, unknown> }[]) {
    const s = node.settings ?? {};
    const source = (node.type === 'lookup_join' ? s.source : node.type === 'pivot' ? s.columns : undefined) as
      | { kind?: unknown; from?: unknown; table?: unknown }
      | undefined;
    const isRef = source !== undefined && (source.kind === 'reference' || source.from === 'reference');
    if (isRef && typeof source.table === 'string') names.add(source.table);
  }
  return [...names];
}

export interface PreparedRun {
  definition: unknown;
  /** The version of each reference table that is valid on the effective date, ready for `runFlow`. */
  refTables: Record<string, TableData>;
  /** Which versions were used, to show on the run screen and to log. */
  resolved: { flow: number; refTables: Record<string, number> };
}

/**
 * Resolves, for one effective date, the flow version and the version of every reference table that the flow reads.
 * Tables that the flow does not read are ignored, so a gap in their versions does not block the run.
 */
export function prepareRun(input: {
  flowName: string;
  flowVersions: FlowVersion[];
  refTables: RefTable[];
  effectiveDate: string;
  includeDrafts?: boolean;
}): PreparedRun {
  const { effectiveDate, includeDrafts } = input;
  const flow = resolveVersion(input.flowVersions, effectiveDate, { what: `flow "${input.flowName}"`, includeDrafts });
  const refTables: Record<string, TableData> = {};
  const resolvedTables: Record<string, number> = {};
  for (const name of referencedTables(flow.definition)) {
    const table = input.refTables.find((t) => t.name === name);
    if (!table) {
      throw new EngineError(
        'missing_reference_table',
        `The flow reads the reference table "${name}", which does not exist. Check the table name in the step settings, or create the table.`,
      );
    }
    const version = resolveVersion(table.versions, effectiveDate, { what: `reference table "${name}"`, includeDrafts });
    refTables[name] = { columns: version.columns, rows: version.rows };
    resolvedTables[name] = version.versionNo;
  }
  return { definition: flow.definition, refTables, resolved: { flow: flow.versionNo, refTables: resolvedTables } };
}

const DAY_MS = 86_400_000;
const shiftDay = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The day before an ISO date (`2026-12-31` for `2027-01-01`). */
export const dayBefore = (iso: string): string => shiftDay(iso, -1);

/** The day after an ISO date. */
export const dayAfter = (iso: string): string => shiftDay(iso, 1);

export type PublishPlan =
  | {
      ok: true;
      /** The previous open-ended published version that ends the day before this one starts (SPEC section 4, rule 6). */
      ends?: { versionNo: number; validTo: string };
    }
  | { ok: false; kind: 'not_found' | 'already_published' | 'overlap'; message: string };

/**
 * What publishing a draft would do, without doing it: which published version it ends, or why it cannot be published
 * (a version that is not there, one already published, a range that would overlap another published version).
 * `what` names the object in messages, for example `flow "Monthly timesheet"`.
 */
export function planPublish(versions: (VersionRange & { status: 'draft' | 'published' })[], versionNo: number, what: string): PublishPlan {
  const v = versions.find((x) => x.versionNo === versionNo);
  if (!v) return { ok: false, kind: 'not_found', message: `Version v${versionNo} of ${what} does not exist.` };
  if (v.status === 'published') return { ok: false, kind: 'already_published', message: `v${versionNo} is already published.` };
  const trial = versions.map((x) => ({ ...x }));
  const target = trial.find((x) => x.versionNo === versionNo)!;
  target.status = 'published';
  const open = trial.find((x) => x.status === 'published' && x.versionNo !== versionNo && x.validTo === null && x.validFrom < target.validFrom);
  if (open) open.validTo = dayBefore(target.validFrom);
  const pairs = findOverlaps(trial.filter((x) => x.status === 'published'));
  if (pairs.length > 0) {
    const [a, b] = pairs[0]!;
    return {
      ok: false,
      kind: 'overlap',
      message: `Publishing v${versionNo} of ${what} would overlap v${a === versionNo ? b : a}. Change the valid-from or valid-to date so the ranges do not share a day.`,
    };
  }
  return { ok: true, ends: open ? { versionNo: open.versionNo, validTo: open.validTo as string } : undefined };
}
