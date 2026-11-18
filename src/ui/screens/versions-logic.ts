import { dayAfter, findOverlaps, formatDate, planPublish } from '../../engine/versions';
import type { FlowVersionRecord } from '../../store/types';
import { translate } from '../i18n';

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

export const stateText = (s: VersionState): string => translate(`versions.state.${s}`);

export const rangeEnd = (v: Pick<FlowVersionRecord, 'validTo'>): string => (v.validTo === null ? translate('versions.noEnd') : two(v.validTo));

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
      const sub =
        v.validTo === null
          ? translate(v.status === 'published' ? 'versions.segment.fromNoEnd' : 'versions.segment.from', { from: monthYear(v.validFrom) })
          : translate('versions.segment.between', { from: monthYear(v.validFrom).slice(0, 3), to: monthYear(v.validTo) });
      return {
        versionNo: v.versionNo,
        state,
        title: translate(state === 'in_effect' ? 'versions.segment.titleInEffect' : state === 'draft' ? 'versions.segment.titleDraft' : 'versions.segment.title', { n: v.versionNo }),
        sub,
        weight: Math.max(30, span),
        axis: monthYear(v.validFrom),
      };
    });
}

/** The version a run on `date` uses: the published one that covers it, or a message that says what happens. */
export function dateCheck(versions: FlowVersionRecord[], date: string): { version?: number; text: string } {
  const hit = versions.find((v) => v.status === 'published' && v.validFrom <= date && (v.validTo === null || date <= v.validTo));
  if (hit) return { version: hit.versionNo, text: translate('versions.check.uses', { date: two(date), n: hit.versionNo }) };
  const published = versions.filter((v) => v.status === 'published');
  return {
    text: published.length === 0
      ? translate('versions.check.nonePublished', { date: two(date) })
      : translate('versions.check.notCovered', { date: two(date) }),
  };
}

/** The note under the timeline: what publishing the newest draft does, or the rule when there is no draft. */
export function timelineNote(versions: FlowVersionRecord[], flowName: string): { text: string; problem: boolean } {
  const overlaps = findOverlaps(versions.filter((v) => v.status === 'published'));
  if (overlaps.length > 0) return { text: translate('versions.note.overlap', { a: overlaps[0]![0], b: overlaps[0]![1] }), problem: true };
  const draft = [...versions].filter((v) => v.status === 'draft').sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!draft) return { text: translate('versions.note.noDraft'), problem: false };
  const plan = planPublish(versions, draft.versionNo, `flow "${flowName}"`);
  if (!plan.ok) return { text: translate('versions.note.planFailed', { message: plan.message }), problem: true };
  return { text: plan.ends ? translate('versions.note.publishEnds', { n: draft.versionNo, prev: plan.ends.versionNo, prevEnd: two(plan.ends.validTo) }) : translate('versions.note.publishValid', { n: draft.versionNo, from: two(draft.validFrom) }), problem: false };
}

/**
 * Why a new version cannot start on `date`: a new version is open-ended, so it must start after every published version that
 * starts on or after it and after the end of every closed one. Returns a message that says which version and what to do.
 */
export function newVersionProblem(versions: VersionLike[], date: string): string | undefined {
  for (const p of versions.filter((v) => v.status === 'published')) {
    if (p.validTo !== null && p.validTo >= date) {
      return translate('versions.problem.inside', { date: two(date), n: p.versionNo, from: two(p.validFrom), to: two(p.validTo) });
    }
    if (p.validTo === null && p.validFrom >= date) {
      return translate('versions.problem.notBefore', { n: p.versionNo, from: two(p.validFrom), date: two(date) });
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
