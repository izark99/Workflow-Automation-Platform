import type { FlowDefinition } from '../../engine/flow/types';
import { validateFlow } from '../../engine/flow/validate';
import { formatDate, planPublish } from '../../engine/versions';
import type { FlowRecord, FlowVersionRecord, User } from '../../store/types';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');

/** The text of a version in the dropdown: `v3, from 01 Jul 2026`, `v2, 01 Apr 2026 to 30 Jun 2026`, `v4, draft from 01 Jan 2027`. */
export function versionOptionLabel(v: Pick<FlowVersionRecord, 'versionNo' | 'validFrom' | 'validTo' | 'status'>): string {
  if (v.status === 'draft') return `v${v.versionNo}, draft from ${two(v.validFrom)}`;
  return v.validTo === null ? `v${v.versionNo}, from ${two(v.validFrom)}` : `v${v.versionNo}, ${two(v.validFrom)} to ${two(v.validTo)}`;
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
  const plan = planPublish(flow.versions, versionNo, `flow "${flow.name}"`);
  if (!plan.ok) return { ok: false, text: plan.message };
  const v = flow.versions.find((x) => x.versionNo === versionNo)!;
  const tail = 'A published version cannot be changed. To change it later, create a new version from it.';
  const text = plan.ends
    ? `Publishing v${versionNo} will end v${plan.ends.versionNo} on ${two(plan.ends.validTo)}. v${versionNo} is valid from ${two(v.validFrom)}. ${tail}`
    : `Publishing v${versionNo} makes it valid from ${two(v.validFrom)}. ${tail}`;
  return { ok: true, text };
}

/** Why the flow cannot be published yet, as one text, or undefined when the flow is valid. */
export function publishBlockers(def: FlowDefinition): string | undefined {
  const v = validateFlow(def);
  if (v.ok) return undefined;
  return v.errors.map((e) => e.message).join(' ');
}
