import type { FlowDefinition } from '../../engine/flow/types';
import { validateFlow } from '../../engine/flow/validate';
import { formatDate, planPublish } from '../../engine/versions';
import { translate } from '../i18n';
import type { FlowRecord, FlowVersionRecord, User } from '../../store/types';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');

/** The text of a version in the dropdown: `v3, from 01 Jul 2026`, `v2, 01 Apr 2026 to 30 Jun 2026`, `v4, draft from 01 Jan 2027`. */
export function versionOptionLabel(v: Pick<FlowVersionRecord, 'versionNo' | 'validFrom' | 'validTo' | 'status'>): string {
  const n = v.versionNo;
  if (v.status === 'draft') return translate('common.version.draftFrom', { n, from: two(v.validFrom) });
  return v.validTo === null ? translate('common.version.from', { n, from: two(v.validFrom) }) : translate('common.version.range', { n, from: two(v.validFrom), to: two(v.validTo) });
}

/** Same JSON, whatever the order of keys. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sort(x)]));
    return v;
  };
  return JSON.stringify(sort(value));
}

/** True when the editor holds a definition that differs from the saved version. */
export const isDirty = (current: FlowDefinition, saved: unknown): boolean => canonical(current) !== canonical(saved);

/** The user may change a flow when they are the admin, or the owner of a personal flow (SPEC section 7). */
export const canEditFlow = (me: User | undefined, flow: FlowRecord): boolean => !!me && (me.role === 'admin' || (flow.scope === 'personal' && flow.ownerId === me.id));

/** What publishing does, in words, for the confirm dialog; or why it cannot be published. */
export function publishSummary(flow: FlowRecord, versionNo: number): { ok: true; text: string } | { ok: false; text: string } {
  return publishSummaryFor(flow.versions, versionNo, `flow "${flow.name}"`);
}

/** The same for any list of versions: a flow's or a reference table's. */
export function publishSummaryFor(versions: (Pick<FlowVersionRecord, 'versionNo' | 'validFrom' | 'validTo' | 'status'>)[], versionNo: number, what: string): { ok: true; text: string } | { ok: false; text: string } {
  const plan = planPublish(versions, versionNo, what);
  if (!plan.ok) return { ok: false, text: plan.message };
  const v = versions.find((x) => x.versionNo === versionNo)!;
  const tail = translate('builder.publishSummary.tail');
  const text = plan.ends
    ? translate('builder.publishSummary.ends', { n: versionNo, prev: plan.ends.versionNo, prevEnd: two(plan.ends.validTo), from: two(v.validFrom), tail })
    : translate('builder.publishSummary.simple', { n: versionNo, from: two(v.validFrom), tail });
  return { ok: true, text };
}

/** Why the flow cannot be published yet, as one text, or undefined when the flow is valid. */
export function publishBlockers(def: FlowDefinition): string | undefined {
  const v = validateFlow(def);
  if (v.ok) return undefined;
  return v.errors.map((e) => e.message).join(' ');
}
