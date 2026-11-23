// DataStore on Supabase (decision D61). Row-level security in Postgres decides what the caller may do;
// this class asks, maps the rows (supabase-mapping.ts) and turns database errors into StoreErrors.
// The read side is T3.6a, the write side T3.6b2. The multi-row writes are database functions (D62).
import type { SupabaseClient } from '@supabase/supabase-js';
import { planPublish } from '../engine/versions';
import { checkRange, checkRowCap } from './checks';
import { importRefTable as importRefTableVia } from './ref-import';
import {
  appSettingsFromRows,
  flowFromRow,
  groupFromRow,
  namesFromRows,
  refPatchToRow,
  refTableFromRow,
  usedByFromRows,
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
  storeError,
  isValidFlowLimit,
  isValidIdleHours,
  type AppSettingKey,
  type AppSettings,
  type DataStore,
  type FlowRecord,
  type Group,
  type RefImportInput,
  type RefImportResult,
  type RefTableRecord,
  type RefTableView,
  type RefVersionPatch,
  type RunLogEntry,
  type Scope,
  type StoreErrorCode,
  type UiText,
  type UiTextChanges,
  type UiTextLocale,
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
  if (code === 'forbidden') return storeError(code, 'errors.notAllowed', { action });
  // A rule the database raised itself (P0001, P0002) already says what failed and what to do next.
  if (code && (error.code === 'P0001' || error.code === 'P0002' || error.code === '22023')) return new StoreError(code, error.message);
  if (error.code === '23P01') {
    return storeError(code ?? 'conflict', 'errors.datesOverlap');
  }
  if (error.code === '23505') {
    return storeError('conflict', 'errors.nameTaken', { action });
  }
  if (code === 'not_found') return storeError(code, 'errors.itemNotFound');
  if (code) return storeError(code, 'errors.couldNotCheck', { action, detail: error.message });
  return storeError('invalid', 'errors.couldNotConnect', { action, detail: error.message });
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
    if (u.role !== 'admin') throw storeError('forbidden', 'errors.adminOnly', { what });
    return u;
  }

  /** Owner and group names of the flows the caller can see. Profiles and groups stay closed to non-admins (D59), D65. */
  private async names(): Promise<NameLookup> {
    return namesFromRows(this.ok<VisibleNameRow[]>(await this.client.rpc('visible_names'), 'read the owner and group names'));
  }

  async currentUser(): Promise<User> {
    const { data, error } = await this.client.auth.getUser();
    const id = data.user?.id;
    if (error || !id) throw storeError('forbidden', 'errors.noUser');
    const profile = await this.client.from('profiles').select('id, name, email, role, locked_at, must_change_password, max_flows').eq('id', id).maybeSingle();
    const row = this.ok<ProfileRow | null>(profile, 'read your profile');
    if (!row) {
      // A locked account cannot read its own profile (D75); say so instead of "no profile".
      if ((await this.statusRow())?.locked) throw storeError('forbidden', 'errors.accountLocked');
      throw storeError('forbidden', 'errors.noProfile');
    }
    // A non-admin cannot read group membership (decision D59); the screens only use it on the Admin screen.
    const members = await this.client.from('group_members').select('group_id').eq('user_id', id);
    return userFromRows(row, this.ok<{ group_id: string }[]>(members, 'read your groups').map((m) => m.group_id));
  }

  async listUsers(): Promise<User[]> {
    await this.mustBeAdmin('see the user list');
    const [profiles, members] = await Promise.all([
      this.client.from('profiles').select('id, name, email, role, locked_at, must_change_password, max_flows').order('name'),
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

  private async statusRow(): Promise<{ locked: boolean; must_change_password: boolean } | null> {
    const result = await this.client.rpc('account_status');
    const rows = this.ok<{ locked: boolean; must_change_password: boolean }[] | null>(result, 'read your account');
    return rows?.[0] ?? null;
  }

  async accountStatus(): Promise<{ locked: boolean; mustChangePassword: boolean }> {
    const row = await this.statusRow();
    if (!row) throw storeError('forbidden', 'errors.noProfile');
    return { locked: row.locked, mustChangePassword: row.must_change_password };
  }

  async clearMustChangePassword(): Promise<void> {
    await this.rpc<unknown>('clear_must_change_password', {}, 'save your password choice');
  }

  async getAppSettings(): Promise<AppSettings> {
    const result = await this.client.from('app_settings').select('key, value');
    return appSettingsFromRows(this.ok<{ key: string; value: unknown }[]>(result, 'read the settings'));
  }

  async saveAppSetting(key: AppSettingKey, value: number): Promise<AppSettings> {
    await this.mustBeAdmin('change the settings');
    if (key !== 'idle_timeout_hours' || !isValidIdleHours(value)) throw storeError('invalid', 'errors.idleHoursInvalid');
    const result = await this.client.from('app_settings').upsert({ key, value }, { onConflict: 'key' }).select('key, value');
    const rows = this.ok<{ key: string; value: unknown }[]>(result, 'save the setting');
    if (rows.length === 0) throw storeError('forbidden', 'errors.cannotChange', { what: 'the setting' });
    return appSettingsFromRows(rows);
  }

  async listUiTexts(): Promise<UiText[]> {
    // Readable by everyone, also before sign-in, so it needs no profile.
    const result = await this.client.from('ui_texts').select('locale, key, value, updated_at');
    return this.ok<{ locale: UiTextLocale; key: string; value: string; updated_at: string }[]>(result, 'read the texts').map((r) => ({ locale: r.locale, key: r.key, value: r.value, updatedAt: r.updated_at }));
  }

  async saveUiTexts(input: UiTextChanges): Promise<void> {
    for (const e of input.entries) if (e.value.trim() === '') throw storeError('invalid', 'errors.textEmpty');
    await this.rpc<unknown>('save_ui_texts', { p_entries: input.entries, p_resets: input.resets }, 'save the texts');
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
    if (!row) throw storeError('not_found', 'errors.flowNotFound');
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

  async listRefTables(): Promise<RefTableView[]> {
    const [tables, refs, flows] = await Promise.all([
      this.client.from('ref_tables').select('*, ref_table_versions(*)').order('name'),
      this.client.from('flow_ref_tables').select('flow_id, ref_table_name'),
      this.client.from('flows').select('id, name').is('deleted_at', null),
    ]);
    const used = usedByFromRows(
      this.ok<{ flow_id: string; ref_table_name: string }[]>(refs, 'load the flows that use the reference tables'),
      this.ok<{ id: string; name: string }[]>(flows, 'load the flows'),
    );
    // The database returns no versions for a table that the caller may not read, so `versions` is empty then.
    return this.ok<RefTableRow[]>(tables, 'load the reference tables').map((row) => ({ ...refTableFromRow(row), usedBy: used.get(row.name) ?? [] }));
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
      throw storeError('forbidden', 'errors.sharedFlowReadOnly');
    }
    return { flow, user };
  }

  private async refTable(id: string): Promise<RefTableRecord> {
    const result = await this.client.from('ref_tables').select('*, ref_table_versions(*)').eq('id', id).maybeSingle();
    const row = this.ok<RefTableRow | null>(result, 'open the reference table');
    if (!row) throw storeError('not_found', 'errors.refTableNotFound');
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
      throw storeError('forbidden', 'errors.cannotChange', { what });
    }
  }

  async saveUser(user: User): Promise<User> {
    await this.mustBeAdmin('change users');
    if (!user.name.trim() || !user.email.includes('@')) {
      throw storeError('invalid', 'errors.userNeedsNameEmail');
    }
    if (!user.id) {
      throw storeError('invalid', 'errors.userViaAuth');
    }
    if (!isValidFlowLimit(user.maxFlows)) throw storeError('invalid', 'errors.flowLimitInvalid');
    await this.updateRow('profiles', { id: user.id }, { name: user.name.trim(), email: user.email.trim(), role: user.role, max_flows: user.maxFlows ?? null }, 'save the user', 'this user');
    await this.rpc('set_user_groups', { p_user_id: user.id, p_group_ids: user.groupIds }, 'save the groups of the user');
    const saved = (await this.listUsers()).find((u) => u.id === user.id);
    if (!saved) throw storeError('not_found', 'errors.userGone');
    return saved;
  }

  async saveGroup(group: { id?: string; name: string }): Promise<Group> {
    await this.mustBeAdmin('change groups');
    const name = group.name.trim();
    if (!name) throw storeError('invalid', 'errors.groupNeedsName');
    if (group.id) {
      const result = await this.client.from('groups').update({ name }).eq('id', group.id).select('id, name').maybeSingle();
      const row = this.ok<GroupRow | null>(result, 'save the group');
      if (!row) throw storeError('not_found', 'errors.groupGone');
      return groupFromRow(row);
    }
    const result = await this.client.from('groups').insert({ name }).select('id, name').single();
    return groupFromRow(this.ok<GroupRow>(result, 'save the group'));
  }

  async deleteGroup(id: string): Promise<void> {
    await this.mustBeAdmin('delete groups');
    const result = await this.client.from('groups').delete().eq('id', id).select('id');
    if (this.ok<unknown[]>(result, 'delete the group').length === 0) {
      throw storeError('not_found', 'errors.groupGone');
    }
  }

  async createFlow({ name, scope }: { name: string; scope: Scope }): Promise<FlowRecord> {
    const user = await this.currentUser();
    if (!name.trim()) throw storeError('invalid', 'errors.flowNeedsName');
    if (scope === 'shared' && user.role !== 'admin') {
      throw storeError('forbidden', 'errors.sharedFlowAdminOnly');
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
    if (!v) throw storeError('not_found', 'errors.versionNotFound', { n: versionNo });
    if (v.status === 'published') {
      throw storeError('conflict', 'errors.versionReadOnly', { n: versionNo });
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
    if (!name.trim()) throw storeError('invalid', 'errors.refTableNeedsName');
    const id = await this.rpc<string>('create_ref_table', { p_name: name, p_description: description, p_columns: columns }, 'create the reference table');
    return this.refTable(id);
  }

  async saveRefTableVersion(tableId: string, versionNo: number, patch: RefVersionPatch): Promise<RefTableRecord> {
    await this.mustBeAdmin('change reference tables');
    const table = await this.refTable(tableId);
    const v = table.versions.find((x) => x.versionNo === versionNo);
    if (!v) throw storeError('not_found', 'errors.versionNotFound', { n: versionNo });
    if (v.status === 'published') {
      throw storeError('conflict', 'errors.versionReadOnly', { n: versionNo });
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

  async updateRefTable(tableId: string, patch: { description: string }): Promise<RefTableRecord> {
    await this.mustBeAdmin('change reference tables');
    await this.updateRow('ref_tables', { id: tableId }, { description: patch.description }, 'save the description', 'the table');
    return this.refTable(tableId);
  }

  async deleteRefTable(tableId: string): Promise<void> {
    await this.mustBeAdmin('delete reference tables');
    // The database refuses while a live flow reads the table and says which flows (migration 19).
    await this.rpc('delete_ref_table', { p_ref_table_id: tableId }, 'delete the table');
  }

  async importRefTable(input: RefImportInput): Promise<RefImportResult> {
    await this.mustBeAdmin('import reference tables');
    return importRefTableVia(this, input);
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
