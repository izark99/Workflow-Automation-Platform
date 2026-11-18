import { dayAfter, findOverlaps, formatDate, planPublish } from '../../engine/versions';
import type { FlowVersionRecord } from '../../store/types';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** What the checks need of a version: flows and reference tables share it. */
export type VersionLike = Pick<FlowVersionRecord, 'status' | 'validFrom' | 'validTo'> & { versionNo: number };

export type VersionState = 'draft' | 'in_effect' | 'ended' | 'upcoming';

/** Where a version stands on `today`: a draft, in effect, ended, or published but not yet started. */
export function versionState(v: Pick<FlowVersionRecord, 'status' | 'validFrom' | 'validTo'>, today: string): VersionState {
  if (v.status === 'draft') return 'draft';
  if (v.validFrom > today) return 'upcoming';
  if (v.validTo !== null && v.validTo < today) return 'ended';
  return 'in_effect';
}

export const stateText = (s: VersionState): string => ({ draft: 'Draft', in_effect: 'Published, in effect', ended: 'Published, ended', upcoming: 'Published, starts later' })[s];

export const rangeEnd = (v: Pick<FlowVersionRecord, 'validTo'>): string => (v.validTo === null ? 'No end date' : two(v.validTo));

export interface Segment {
  versionNo: number;
  state: VersionState;
  title: string;
  sub: string;
  /** Relative width of the segment; at least 30 so a short version stays readable. */
  weight: number;
  /** The month where the segment starts, for the axis under the bar. */
  axis: string;
}

const DAY = 86_400_000;
const days = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY) + 1;

/** The bar of the timeline: versions in date order, each as wide as its range (an open end counts as 120 days). */
export function timeline(versions: FlowVersionRecord[], today: string): Segment[] {
  return [...versions]
    .sort((a, b) => (a.validFrom === b.validFrom ? a.versionNo - b.versionNo : a.validFrom < b.validFrom ? -1 : 1))
    .map((v) => {
      const state = versionState(v, today);
      const span = v.validTo === null ? 120 : days(v.validFrom, v.validTo);
      const sub = v.validTo === null ? `From ${monthYear(v.validFrom)}${v.status === 'published' ? ', no end date' : ''}` : `${monthYear(v.validFrom).slice(0, 3)} to ${monthYear(v.validTo)}`;
      return {
        versionNo: v.versionNo,
        state,
        title: `v${v.versionNo}${state === 'in_effect' ? ', in effect' : state === 'draft' ? ', draft' : ''}`,
        sub,
        weight: Math.max(30, span),
        axis: monthYear(v.validFrom),
      };
    });
}

/** The version a run on `date` uses: the published one that covers it, or a message that says what happens. */
export function dateCheck(versions: FlowVersionRecord[], date: string): { version?: number; text: string } {
  const hit = versions.find((v) => v.status === 'published' && v.validFrom <= date && (v.validTo === null || date <= v.validTo));
  if (hit) return { version: hit.versionNo, text: `A run with effective date ${two(date)} uses v${hit.versionNo}.` };
  const published = versions.filter((v) => v.status === 'published');
  return {
    text: published.length === 0
      ? `No version is published, so a run with effective date ${two(date)} stops with an error. Publish a version first.`
      : `No published version covers ${two(date)}, so a run with that effective date stops with an error. Choose a date inside a version, or add a version for it.`,
  };
}

/** The note under the timeline: what publishing the newest draft does, or the rule when there is no draft. */
export function timelineNote(versions: FlowVersionRecord[], flowName: string): { text: string; problem: boolean } {
  const overlaps = findOverlaps(versions.filter((v) => v.status === 'published'));
  if (overlaps.length > 0) return { text: `The published versions v${overlaps[0]![0]} and v${overlaps[0]![1]} share a day. Versions cannot overlap: change the dates of one of them.`, problem: true };
  const draft = [...versions].filter((v) => v.status === 'draft').sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!draft) return { text: 'Versions cannot overlap. A new version starts after the one before it.', problem: false };
  const plan = planPublish(versions, draft.versionNo, `flow "${flowName}"`);
  if (!plan.ok) return { text: `Versions cannot overlap. ${plan.message}`, problem: true };
  return { text: `Versions cannot overlap. Publishing v${draft.versionNo} will ${plan.ends ? `end v${plan.ends.versionNo} on ${two(plan.ends.validTo)}` : `make it valid from ${two(draft.validFrom)}`}.`, problem: false };
}

/**
 * Why a new version cannot start on `date`: a new version is open-ended, so it must start after every published version that
 * starts on or after it and after the end of every closed one. Returns a message that says which version and what to do.
 */
export function newVersionProblem(versions: VersionLike[], date: string): string | undefined {
  for (const p of versions.filter((v) => v.status === 'published')) {
    if (p.validTo !== null && p.validTo >= date) {
      return `${two(date)} is inside v${p.versionNo} (${two(p.validFrom)} to ${two(p.validTo)}). Choose a day after ${two(p.validTo)}.`;
    }
    if (p.validTo === null && p.validFrom >= date) {
      return `v${p.versionNo} starts on ${two(p.validFrom)}, which is not before ${two(date)}. Choose a day after ${two(p.validFrom)}.`;
    }
  }
  return undefined;
}

/** A first suggestion for the start of a new version: after every published start and end. */
export function suggestStart(versions: VersionLike[], today: string): string {
  const marks = versions.filter((v) => v.status === 'published').map((v) => v.validTo ?? v.validFrom);
  const latest = marks.sort().at(-1);
  return latest !== undefined && latest >= today ? dayAfter(latest) : today;
}
