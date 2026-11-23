import { KEEP_DELETED_DAYS, MAX_FLOWS_LIMIT } from '../../store/types';
import type { FlowRecord, Group, User } from '../../store/types';
import { translate, formatDate } from '../i18n';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');
const DAY = 86_400_000;

/** The groups of a user as the table shows them: the admin has every group, a user their own, or "No group". */
export function groupsText(user: User, groups: Group[]): string {
  if (user.role === 'admin') return translate('admin.allGroups');
  const names = user.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(', ') : translate('admin.noGroup');
}

export const memberCount = (group: Group, users: User[]): number => users.filter((u) => u.groupIds.includes(group.id)).length;

/** `05 Nov 2026` for the day a flow was deleted, from its ISO date-time. */
export const deletedOn = (iso: string): string => two(iso.slice(0, 10));

/** The last day a deleted flow is kept: 30 days after it was deleted. */
export const keptUntil = (iso: string): string => two(new Date(Date.parse(iso) + KEEP_DELETED_DAYS * DAY).toISOString().slice(0, 10));

/** The group ids of a shared flow after a box is ticked or unticked, in the order of the groups. */
export function toggleGroup(flow: Pick<FlowRecord, 'groupIds'>, groups: Group[], groupId: string, on: boolean): string[] {
  const set = new Set(flow.groupIds);
  if (on) set.add(groupId);
  else set.delete(groupId);
  return groups.filter((g) => set.has(g.id)).map((g) => g.id);
}

export interface UserForm {
  name: string;
  email: string;
  role: 'admin' | 'user';
  groupIds: string[];
  /** The number of flows a user may own, as typed: empty means no limit. */
  maxFlows: string;
}

/** The typed limit as a number, or null for an empty field. NaN when it is not a whole number in range. */
export function parseFlowLimit(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = /^\d{1,5}$/.test(t) ? Number(t) : Number.NaN;
  return n <= MAX_FLOWS_LIMIT ? n : Number.NaN;
}

/** What is wrong with a user form, in words that say what to do; undefined when it can be saved. */
export function userFormProblem(f: UserForm): string | undefined {
  if (f.name.trim() === '') return translate('admin.error.nameEmpty');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return translate('admin.error.emailInvalid', { email: f.email.trim() });
  if (f.role === 'user' && Number.isNaN(parseFlowLimit(f.maxFlows))) return translate('admin.error.flowLimit');
  return undefined;
}
