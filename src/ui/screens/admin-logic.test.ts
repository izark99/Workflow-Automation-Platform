import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../store/seed';
import { deletedOn, groupsText, keptUntil, memberCount, toggleGroup, userFormProblem } from './admin-logic';

const snap = seedSnapshot();
const user = (id: string) => snap.users.find((u) => u.id === id)!;

describe('texts of the Users and Groups tables', () => {
  it('the admin has all groups; a user their own; a user with none says so', () => {
    expect(groupsText(user('user-harold'), snap.groups)).toBe('All groups');
    expect(groupsText(user('user-lan'), snap.groups)).toBe('HR Payroll');
    expect(groupsText(user('user-thu'), snap.groups)).toBe('HR Payroll, HR Analytics');
    expect(groupsText({ ...user('user-lan'), groupIds: [] }, snap.groups)).toBe('No group');
    expect(groupsText({ ...user('user-lan'), groupIds: ['gone'] }, snap.groups)).toBe('No group');
  });
  it('counts the members of a group', () => {
    expect(memberCount(snap.groups[0]!, snap.users)).toBe(3);
    expect(memberCount(snap.groups[1]!, snap.users)).toBe(3); // Harold, Minh and Thu
  });
});

describe('deleted flows', () => {
  it('shows the day of the delete and the last day it is kept (30 days later), as the screen does', () => {
    expect(deletedOn('2026-11-05T09:00:00.000Z')).toBe('05 Nov 2026');
    expect(keptUntil('2026-11-05T09:00:00.000Z')).toBe('05 Dec 2026');
    expect(keptUntil('2026-10-28T09:00:00.000Z')).toBe('27 Nov 2026');
    expect(keptUntil('2026-12-15T23:00:00.000Z')).toBe('14 Jan 2027');
  });
});

describe('group access', () => {
  it('ticks and unticks a group and keeps the order of the groups', () => {
    const flow = { groupIds: ['group-analytics'] };
    expect(toggleGroup(flow, snap.groups, 'group-payroll', true)).toEqual(['group-payroll', 'group-analytics']);
    expect(toggleGroup(flow, snap.groups, 'group-analytics', false)).toEqual([]);
    expect(toggleGroup(flow, snap.groups, 'group-analytics', true)).toEqual(['group-analytics']);
  });
});

describe('user form', () => {
  const ok = { name: 'Lan', email: 'lan@example.com', role: 'user' as const, groupIds: [] };
  it('needs a name and an email address, and says what to type', () => {
    expect(userFormProblem(ok)).toBeUndefined();
    expect(userFormProblem({ ...ok, name: '  ' })).toMatch(/name is empty/);
    expect(userFormProblem({ ...ok, email: 'nope' })).toMatch(/"nope" is not an email address.*name@example\.com/);
    expect(userFormProblem({ ...ok, email: 'a@b' })).toBeDefined();
    expect(userFormProblem({ ...ok, email: ' a@b.co ' })).toBeUndefined();
  });
});
