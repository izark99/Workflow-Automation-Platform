import { formatDate } from '../../engine/versions';
import { KEEP_DELETED_DAYS } from '../../store/types';
import type { FlowRecord, Group, User } from '../../store/types';

const two = (iso: string): string => formatDate(iso).replace(/^(\d) /, '0$1 ');
const DAY = 86_400_000;

/** The groups of a user as the table shows them: the admin has every group, a user their own, or "No group". */
export function groupsText(user: User, groups: Group[]): string {
  if (user.role === 'admin') return 'All groups';
  const names = user.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(', ') : 'No group';
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
}

/** What is wrong with a user form, in words that say what to do; undefined when it can be saved. */
export function userFormProblem(f: UserForm): string | undefined {
  if (f.name.trim() === '') return 'The name is empty. Type the name of the user.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return `"${f.email.trim()}" is not an email address. Type an address like name@example.com.`;
  return undefined;
}
