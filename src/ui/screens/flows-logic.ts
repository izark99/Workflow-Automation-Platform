import type { Message } from '../i18n';
import type { FlowRecord, FlowVersionRecord, User } from '../../store/types';
import { formatDate } from '../i18n';

export type ScopeFilter = 'all' | 'personal' | 'shared';

/** Local calendar date as ISO text. */
export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** The published version that covers `today`, or undefined. */
export function versionInEffect(flow: FlowRecord, today: string): FlowVersionRecord | undefined {
  return flow.versions.find((v) => v.status === 'published' && v.validFrom <= today && (v.validTo === null || today <= v.validTo));
}

/** The version that Open shows: the one in effect, else the newest version. */
export function versionToOpen(flow: FlowRecord, today: string): FlowVersionRecord | undefined {
  return versionInEffect(flow, today) ?? [...flow.versions].sort((a, b) => b.versionNo - a.versionNo)[0];
}

interface Node {
  type?: string;
}

/** Steps and output sheets of a version, counted from the flow definition. */
export function countSteps(definition: unknown): { steps: number; outputs: number } {
  const nodes = ((definition as { nodes?: Node[] } | null)?.nodes ?? []) as Node[];
  return { steps: nodes.length, outputs: nodes.filter((n) => n.type === 'output').length };
}

export function describeSteps(definition: unknown): Message {
  const { steps, outputs } = countSteps(definition);
  return { key: 'flows.steps', params: { steps, outputs } };
}

/** `From 01 Jul 2026`, `01 Jan 2026 to 30 Jun 2026`, or `Not published yet`. The screens write days with two digits. */
export function describeRange(v: FlowVersionRecord | undefined): Message {
  if (!v || v.status === 'draft') return { key: 'flows.range.notPublished' };
  const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');
  return v.validTo === null ? { key: 'flows.range.from', params: { from: two(v.validFrom) } } : { key: 'flows.range.between', params: { from: two(v.validFrom), to: two(v.validTo) } };
}

export function filterFlows(flows: FlowRecord[], scope: ScopeFilter, search: string): FlowRecord[] {
  const needle = search.trim().toLowerCase();
  return flows.filter((f) => (scope === 'all' || f.scope === scope) && (!needle || f.name.toLowerCase().includes(needle)));
}

/** The admin deletes any flow; a user deletes a personal flow of their own (SPEC section 7). */
export const canDeleteFlow = (user: User, flow: FlowRecord): boolean => user.role === 'admin' || (flow.scope === 'personal' && flow.ownerId === user.id);

/** A flow can be run when a published version exists. A draft has no effective range yet. */
export const canRunFlow = (flow: FlowRecord): boolean => flow.versions.some((v) => v.status === 'published');
