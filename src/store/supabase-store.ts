// DataStore on Supabase (decision D61). Row-level security in Postgres decides what the caller may do;
// this class asks, maps the rows (supabase-mapping.ts) and turns database errors into StoreErrors.
// The read side is T3.6a, the write side T3.6b2. The multi-row writes are database functions (D62).
import type { SupabaseClient } from '@supabase/supabase-js';
import { planPublish } from '../engine/versions';
import { checkRange, checkRowCap } from './checks';
import {
  flowFromRow,
  groupFromRow,
  namesFromRows,
  refPatchToRow,
  refTableFromRow,
  runLogFromRow,
  runLogToRow,
  userFromRows,
  versionPatchToRow,
  type FlowRow,
  type GroupRow,
  type NameLookup,
  type ProfileRow,
  type RefTableRow,
  type RunLogRow,
  type VisibleNameRow,
} from './supabase-mapping';
import {
  StoreError,
  type DataStore,
  type FlowRecord,
  type Group,
  type RefTableRecord,
  type RefVersionPatch,
  type RunLogEntry,
  type Scope,
  type StoreErrorCode,
  type User,
  type VersionPatch,
} from './types';
import type { Column } from '../engine/types';

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
  '22023': 'invalid',
  P0002: 'not_found',
  PGRST116: 'not_found',
  P0001: 'conflict',
};

/** What the person doing `action` should read when the database refuses. `action` is a phrase such as "save the flow". */
export function storeErrorFrom(error: DbError, action: string): StoreError {
  const code = CODES[error.code ?? ''];
  if (code === 'forbidden') return new StoreError(code, `You are not allowed to ${action}. Ask the admin if you need this right.`);
  // A rule the database raised itself (P0001, P0002) already says what failed and what to do next.
  if (code && (error.code === 'P0001' || error.code === 'P0002' || error.code === '22023')) return new StoreError(code, error.message);
  if (error.code === '23P01') {
    return new StoreError(code ?? 'conflict', 'These dates overlap another published version. Change the valid-from or valid-to date so the ranges do not share a day.');
  }
  if (error.code === '23505') {
    return new StoreError('conflict', `Could not ${action}: that name or email is already used. Use another one and try again.`);
  }
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


  private async mustBeAdmin(what: string): Promise<User> {
    const u = await this.currentUser();
    if (u.role !== 'admin') throw new StoreError('forbidden', `Only the admin can ${what}. Ask the admin.`);
    return u;
  }

  /** Owner and group names of the flows the caller can see. Profiles and groups stay closed to non-admins (D59), D65. */
  private async names(): Promise<NameLookup> {
    return namesFromRows(this.ok<VisibleNameRow[]>(await this.client.rpc('visible_names'), 'read the owner and group names'));
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

  // ---- Write side ----

  private async signedInId(): Promise<string> {
    return (await this.currentUser()).id;
  }

  /** A flow the caller may change: the admin, or the owner of a personal flow. Otherwise the same message as the local store. */
  private async flowForEdit(id: string): Promise<{ flow: FlowRecord; user: User }> {
    const [flow, user] = await Promise.all([this.getFlow(id), this.currentUser()]);
    if (user.role !== 'admin' && !(flow.scope === 'personal' && flow.ownerId === user.id)) {
      throw new StoreError('forbidden', 'You can view and run this shared flow, but only the admin can change it. Copy it to a personal flow to edit.');
    }
    return { flow, user };
  }

  private async refTable(id: string): Promise<RefTableRecord> {
    const result = await this.client.from('ref_tables').select('*, ref_table_versions(*)').eq('id', id).maybeSingle();
    const row = this.ok<RefTableRow | null>(result, 'open the reference table');
    if (!row) throw new StoreError('not_found', 'This reference table does not exist. Go back to the Reference tables list.');
    return refTableFromRow(row);
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>, action: string): Promise<T> {
    return this.ok<T>(await this.client.rpc(fn, args), action);
  }

  /** An update that matched no row means the row is gone or row-level security hid it. */
  private async updateRow(table: string, match: Record<string, unknown>, patch: Record<string, unknown>, action: string, what: string): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    const result = await this.client.from(table).update(patch).match(match).select();
    const rows = this.ok<unknown[]>(result, action);
    if (rows.length === 0) {
      throw new StoreError('forbidden', `You cannot change ${what}, or it no longer exists. Reload the page and try again.`);
    }
  }

  async saveUser(user: User): Promise<User> {
    await this.mustBeAdmin('change users');
    if (!user.name.trim() || !user.email.includes('@')) {
      throw new StoreError('invalid', 'A user needs a name and an email address. Fill both and save again.');
    }
    if (!user.id) {
      throw new StoreError('invalid', 'A new user is added in Supabase Auth (see docs/DEPLOY.md). They appear in this list after that; then you can set their role and groups here.');
    }
    await this.updateRow('profiles', { id: user.id }, { name: user.name.trim(), email: user.email.trim(), role: user.role }, 'save the user', 'this user');
    await this.rpc('set_user_groups', { p_user_id: user.id, p_group_ids: user.groupIds }, 'save the groups of the user');
    const saved = (await this.listUsers()).find((u) => u.id === user.id);
    if (!saved) throw new StoreError('not_found', 'This user does not exist any more. Reload the page.');
    return saved;
  }

  async saveGroup(group: { id?: string; name: string }): Promise<Group> {
    await this.mustBeAdmin('change groups');
    const name = group.name.trim();
    if (!name) throw new StoreError('invalid', 'A group needs a name. Type a name and save again.');
    if (group.id) {
      const result = await this.client.from('groups').update({ name }).eq('id', group.id).select('id, name').maybeSingle();
      const row = this.ok<GroupRow | null>(result, 'save the group');
      if (!row) throw new StoreError('not_found', 'This group does not exist any more. Reload the page.');
      return groupFromRow(row);
    }
    const result = await this.client.from('groups').insert({ name }).select('id, name').single();
    return groupFromRow(this.ok<GroupRow>(result, 'save the group'));
  }

  async deleteGroup(id: string): Promise<void> {
    await this.mustBeAdmin('delete groups');
    const result = await this.client.from('groups').delete().eq('id', id).select('id');
    if (this.ok<unknown[]>(result, 'delete the group').length === 0) {
      throw new StoreError('not_found', 'This group does not exist any more. Reload the page.');
    }
  }

  async createFlow({ name, scope }: { name: string; scope: Scope }): Promise<FlowRecord> {
    const user = await this.currentUser();
    if (!name.trim()) throw new StoreError('invalid', 'A flow needs a name. Type a name and try again.');
    if (scope === 'shared' && user.role !== 'admin') {
      throw new StoreError('forbidden', 'Only the admin creates shared flows. Create a personal flow instead.');
    }
    const id = await this.rpc<string>('create_flow', { p_name: name, p_scope: scope }, 'create the flow');
    return this.getFlow(id);
  }

  async copyFlow(id: string, name: string): Promise<FlowRecord> {
    const copyId = await this.rpc<string>('copy_flow', { p_source: id, p_name: name }, 'copy the flow');
    return this.getFlow(copyId);
  }

  async setFlowGroups(id: string, groupIds: string[]): Promise<FlowRecord> {
    await this.mustBeAdmin('change who can use a shared flow');
    await this.rpc('set_flow_groups', { p_flow_id: id, p_group_ids: groupIds }, 'change the groups of the flow');
    return this.getFlow(id);
  }

  async deleteFlow(id: string): Promise<void> {
    await this.flowForEdit(id);
    await this.rpc('delete_flow', { p_flow_id: id }, 'delete the flow');
  }

  async restoreFlow(id: string): Promise<FlowRecord> {
    await this.mustBeAdmin('restore or remove deleted flows');
    await this.rpc('restore_flow', { p_flow_id: id }, 'restore the flow');
    return this.getFlow(id);
  }

  async purgeFlow(id: string): Promise<void> {
    await this.mustBeAdmin('restore or remove deleted flows');
    await this.rpc('purge_flow', { p_flow_id: id }, 'remove the flow for good');
  }

  async purgeExpired(): Promise<number> {
    await this.mustBeAdmin('remove deleted flows');
    return this.rpc<number>('purge_expired_flows', {}, 'remove the expired flows');
  }

  async saveFlowVersion(flowId: string, versionNo: number, patch: VersionPatch): Promise<FlowRecord> {
    const { flow } = await this.flowForEdit(flowId);
    const v = flow.versions.find((x) => x.versionNo === versionNo);
    if (!v) throw new StoreError('not_found', `Version v${versionNo} does not exist. Pick a version from the list.`);
    if (v.status === 'published') {
      throw new StoreError('conflict', `v${versionNo} is published and read-only. Create a new version from it to make changes.`);
    }
    checkRange(patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    await this.updateRow('flow_versions', { flow_id: flowId, version_no: versionNo }, versionPatchToRow(patch), 'save the version', `version v${versionNo}`);
    return this.getFlow(flowId);
  }

  async createFlowVersion(flowId: string, input: { validFrom: string; copyFrom?: number; changeNote?: string }): Promise<FlowRecord> {
    await this.flowForEdit(flowId);
    checkRange(input.validFrom, null);
    await this.rpc(
      'create_flow_version',
      { p_flow_id: flowId, p_valid_from: input.validFrom, p_copy_from: input.copyFrom ?? null, p_note: input.changeNote ?? '' },
      'create the version',
    );
    return this.getFlow(flowId);
  }

  async publishFlowVersion(flowId: string, versionNo: number): Promise<FlowRecord> {
    const { flow } = await this.flowForEdit(flowId);
    // The same check as the local store, so the message names the version it would overlap. The database enforces it too.
    const plan = planPublish(flow.versions, versionNo, `flow "${flow.name}"`);
    if (!plan.ok) throw new StoreError(plan.kind === 'not_found' ? 'not_found' : 'conflict', plan.message);
    await this.rpc('publish_flow_version', { p_flow_id: flowId, p_version_no: versionNo }, 'publish the version');
    return this.getFlow(flowId);
  }

  async createRefTable({ name, description, columns }: { name: string; description: string; columns: Column[] }): Promise<RefTableRecord> {
    await this.mustBeAdmin('create reference tables');
    if (!name.trim()) throw new StoreError('invalid', 'A reference table needs a name. Type a name and try again.');
    const id = await this.rpc<string>('create_ref_table', { p_name: name, p_description: description, p_columns: columns }, 'create the reference table');
    return this.refTable(id);
  }

  async saveRefTableVersion(tableId: string, versionNo: number, patch: RefVersionPatch): Promise<RefTableRecord> {
    await this.mustBeAdmin('change reference tables');
    const table = await this.refTable(tableId);
    const v = table.versions.find((x) => x.versionNo === versionNo);
    if (!v) throw new StoreError('not_found', `Version v${versionNo} does not exist. Pick a version from the list.`);
    if (v.status === 'published') {
      throw new StoreError('conflict', `v${versionNo} is published and read-only. Create a new version from it to make changes.`);
    }
    if (patch.rows) checkRowCap(patch.rows.length);
    checkRange(patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    await this.updateRow('ref_table_versions', { ref_table_id: tableId, version_no: versionNo }, refPatchToRow(patch), 'save the version', `version v${versionNo}`);
    return this.refTable(tableId);
  }

  async createRefTableVersion(tableId: string, input: { validFrom: string; copyFrom?: number }): Promise<RefTableRecord> {
    await this.mustBeAdmin('change reference tables');
    checkRange(input.validFrom, null);
    await this.rpc(
      'create_ref_table_version',
      { p_table_id: tableId, p_valid_from: input.validFrom, p_copy_from: input.copyFrom ?? null },
      'create the version',
    );
    return this.refTable(tableId);
  }

  async publishRefTableVersion(tableId: string, versionNo: number): Promise<RefTableRecord> {
    await this.mustBeAdmin('change reference tables');
    const table = await this.refTable(tableId);
    const plan = planPublish(table.versions, versionNo, `reference table "${table.name}"`);
    if (!plan.ok) throw new StoreError(plan.kind === 'not_found' ? 'not_found' : 'conflict', plan.message);
    await this.rpc('publish_ref_table_version', { p_ref_table_id: tableId, p_version_no: versionNo }, 'publish the version');
    return this.refTable(tableId);
  }

  async addRunLog(entry: Omit<RunLogEntry, 'id' | 'userId' | 'runAt'>): Promise<RunLogEntry> {
    const userId = await this.signedInId();
    await this.getFlow(entry.flowId);
    const result = await this.client.from('run_log').insert(runLogToRow(entry, userId)).select('*').single();
    return runLogFromRow(this.ok<RunLogRow>(result, 'write the run log'));
  }
}
