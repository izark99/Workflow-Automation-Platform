// DataStore on Supabase (decision D61). Row-level security in Postgres decides what the caller may do;
// this class asks, maps the rows (supabase-mapping.ts) and turns database errors into StoreErrors.
// Part 1 (T3.6a) is the read side. The write side follows in T3.6b.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  flowFromRow,
  groupFromRow,
  refTableFromRow,
  runLogFromRow,
  userFromRows,
  type FlowRow,
  type GroupRow,
  type NameLookup,
  type ProfileRow,
  type RefTableRow,
  type RunLogRow,
} from './supabase-mapping';
import {
  StoreError,
  type DataStore,
  type FlowRecord,
  type Group,
  type RefTableRecord,
  type RunLogEntry,
  type StoreErrorCode,
  type User,
} from './types';

interface DbError {
  code?: string;
  message: string;
}

const CODES: Record<string, StoreErrorCode> = {
  '42501': 'forbidden',
  '23P01': 'conflict',
  '23505': 'conflict',
  '23503': 'conflict',
  '23514': 'invalid',
  '22P02': 'invalid',
  P0002: 'not_found',
  PGRST116: 'not_found',
  P0001: 'conflict',
};

/** What the person doing `action` should read when the database refuses. `action` is a phrase such as "save the flow". */
export function storeErrorFrom(error: DbError, action: string): StoreError {
  const code = CODES[error.code ?? ''];
  if (code === 'forbidden') return new StoreError(code, `You are not allowed to ${action}. Ask the admin if you need this right.`);
  // A rule the database raised itself (P0001, P0002) already says what failed and what to do next.
  if (code && (error.code === 'P0001' || error.code === 'P0002')) return new StoreError(code, error.message);
  if (code === 'not_found') return new StoreError(code, `This item does not exist or you cannot open it. Go back to the list and try again.`);
  if (code) return new StoreError(code, `Could not ${action}: ${error.message}. Check what you entered and try again.`);
  return new StoreError('invalid', `Could not ${action}: ${error.message}. Check the connection and try again.`);
}

const FLOW_COLUMNS = '*, flow_versions(*), flow_group_access(group_id)';

export class SupabaseStore implements DataStore {
  constructor(private readonly client: SupabaseClient) {}

  /** Throws a StoreError for a failed call, returns the data of a good one. */
  private ok<T>(result: { data: T | null; error: DbError | null }, action: string): T {
    if (result.error) throw storeErrorFrom(result.error, action);
    return result.data as T;
  }

  private notYet(what: string): never {
    throw new StoreError('invalid', `${what} is not available on the server yet. Use the local data store for now.`);
  }

  private async mustBeAdmin(what: string): Promise<User> {
    const u = await this.currentUser();
    if (u.role !== 'admin') throw new StoreError('forbidden', `Only the admin can ${what}. Ask the admin.`);
    return u;
  }

  /** Names the caller may read: all of them for the admin, the own profile and no groups for anyone else. */
  private async names(): Promise<NameLookup> {
    const [profiles, groups] = await Promise.all([
      this.client.from('profiles').select('id, name'),
      this.client.from('groups').select('id, name'),
    ]);
    return {
      users: new Map(this.ok<{ id: string; name: string }[]>(profiles, 'read the user names').map((p) => [p.id, p.name])),
      groups: new Map(this.ok<GroupRow[]>(groups, 'read the group names').map((g) => [g.id, g.name])),
    };
  }

  async currentUser(): Promise<User> {
    const { data, error } = await this.client.auth.getUser();
    const id = data.user?.id;
    if (error || !id) throw new StoreError('forbidden', 'No user is signed in. Sign in and try again.');
    const profile = await this.client.from('profiles').select('id, name, email, role').eq('id', id).maybeSingle();
    const row = this.ok<ProfileRow | null>(profile, 'read your profile');
    if (!row) throw new StoreError('forbidden', 'Your account has no profile yet. Ask the admin to add you, then sign in again.');
    // A non-admin cannot read group membership (decision D59); the screens only use it on the Admin screen.
    const members = await this.client.from('group_members').select('group_id').eq('user_id', id);
    return userFromRows(row, this.ok<{ group_id: string }[]>(members, 'read your groups').map((m) => m.group_id));
  }

  async listUsers(): Promise<User[]> {
    await this.mustBeAdmin('see the user list');
    const [profiles, members] = await Promise.all([
      this.client.from('profiles').select('id, name, email, role').order('name'),
      this.client.from('group_members').select('group_id, user_id'),
    ]);
    const memberRows = this.ok<{ group_id: string; user_id: string }[]>(members, 'read the group members');
    return this.ok<ProfileRow[]>(profiles, 'read the users').map((p) =>
      userFromRows(p, memberRows.filter((m) => m.user_id === p.id).map((m) => m.group_id)),
    );
  }

  async listGroups(): Promise<Group[]> {
    await this.mustBeAdmin('see the groups');
    const result = await this.client.from('groups').select('id, name').order('name');
    return this.ok<GroupRow[]>(result, 'read the groups').map(groupFromRow);
  }

  async listFlows(): Promise<FlowRecord[]> {
    const [flows, names] = await Promise.all([
      this.client.from('flows').select(FLOW_COLUMNS).is('deleted_at', null).order('name'),
      this.names(),
    ]);
    return this.ok<FlowRow[]>(flows, 'load the flows').map((r) => flowFromRow(r, names));
  }

  async getFlow(id: string): Promise<FlowRecord> {
    const [flow, names] = await Promise.all([this.client.from('flows').select(FLOW_COLUMNS).eq('id', id).maybeSingle(), this.names()]);
    const row = this.ok<FlowRow | null>(flow, 'open the flow');
    if (!row) throw new StoreError('not_found', 'This flow does not exist or you cannot open it. Go back to the Flows list.');
    return flowFromRow(row, names);
  }

  async listDeletedFlows(): Promise<FlowRecord[]> {
    await this.mustBeAdmin('see deleted flows');
    const [flows, names] = await Promise.all([
      this.client.from('flows').select(FLOW_COLUMNS).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      this.names(),
    ]);
    return this.ok<FlowRow[]>(flows, 'load the deleted flows').map((r) => flowFromRow(r, names));
  }

  async listRefTables(): Promise<RefTableRecord[]> {
    const result = await this.client.from('ref_tables').select('*, ref_table_versions(*)').order('name');
    return this.ok<RefTableRow[]>(result, 'load the reference tables').map(refTableFromRow);
  }

  async listRunLog(flowId: string): Promise<RunLogEntry[]> {
    await this.getFlow(flowId);
    const result = await this.client.from('run_log').select('*').eq('flow_id', flowId).order('run_at', { ascending: false });
    return this.ok<RunLogRow[]>(result, 'load the run log').map(runLogFromRow);
  }

  // Write side: T3.6b.
  saveUser(): Promise<User> { return this.notYet('Saving a user'); }
  saveGroup(): Promise<Group> { return this.notYet('Saving a group'); }
  deleteGroup(): Promise<void> { return this.notYet('Deleting a group'); }
  createFlow(): Promise<FlowRecord> { return this.notYet('Creating a flow'); }
  copyFlow(): Promise<FlowRecord> { return this.notYet('Copying a flow'); }
  setFlowGroups(): Promise<FlowRecord> { return this.notYet('Changing the groups of a flow'); }
  deleteFlow(): Promise<void> { return this.notYet('Deleting a flow'); }
  restoreFlow(): Promise<FlowRecord> { return this.notYet('Restoring a flow'); }
  purgeFlow(): Promise<void> { return this.notYet('Removing a flow for good'); }
  purgeExpired(): Promise<number> { return this.notYet('Removing expired flows'); }
  saveFlowVersion(): Promise<FlowRecord> { return this.notYet('Saving a flow version'); }
  createFlowVersion(): Promise<FlowRecord> { return this.notYet('Creating a flow version'); }
  publishFlowVersion(): Promise<FlowRecord> { return this.notYet('Publishing a flow version'); }
  createRefTable(): Promise<RefTableRecord> { return this.notYet('Creating a reference table'); }
  saveRefTableVersion(): Promise<RefTableRecord> { return this.notYet('Saving a reference table version'); }
  createRefTableVersion(): Promise<RefTableRecord> { return this.notYet('Creating a reference table version'); }
  publishRefTableVersion(): Promise<RefTableRecord> { return this.notYet('Publishing a reference table version'); }
  addRunLog(): Promise<RunLogEntry> { return this.notYet('Writing the run log'); }
}
