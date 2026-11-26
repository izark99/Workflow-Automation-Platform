import { planPublish, referencedTables } from '../engine/versions';
import type { VersionRange } from '../engine/versions';
import { checkDraftRange, checkRange, checkRowCap } from './checks';
import { importRefTable as importRefTableVia } from './ref-import';
import { DEFAULT_IDLE_TIMEOUT_HOURS, KEEP_DELETED_DAYS, StoreError, isValidFlowLimit, isValidIdleHours, storeError, type StoreErrorCode } from './types';
import type { StoreMessageId } from './messages';
import type {
  DataStore,
  FlowRecord,
  FlowVersionRecord,
  Group,
  RefImportInput,
  RefImportResult,
  RefTableRecord,
  RefTableVersionRecord,
  RefTableView,
  RefVersionPatch,
  RunLogEntry,
  Scope,
  AppSettingKey,
  AppSettings,
  UiText,
  UiTextChanges,
  User,
  VersionPatch,
} from './types';

export interface Snapshot {
  currentUserId: string;
  seq: number;
  users: User[];
  groups: Group[];
  flows: FlowRecord[];
  refTables: RefTableRecord[];
  runLog: RunLogEntry[];
  /** Edited UI texts. Missing in a snapshot saved before Phase 4. */
  uiTexts?: UiText[];
  /** App settings by key. Missing in a snapshot saved before Phase 5. */
  appSettings?: Partial<Record<AppSettingKey, number>>;
}

/** Where the snapshot lives between page loads. The browser uses IndexedDB (decision D37); the tests use memory. */
export interface PersistenceAdapter {
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
}

export class MemoryAdapter implements PersistenceAdapter {
  saved: Snapshot | null = null;
  async load(): Promise<Snapshot | null> {
    return this.saved ? structuredClone(this.saved) : null;
  }
  async save(snapshot: Snapshot): Promise<void> {
    this.saved = structuredClone(snapshot);
  }
}

export interface LocalStoreOptions {
  adapter: PersistenceAdapter;
  /** Used when the adapter has nothing yet. */
  seed: () => Snapshot;
  now?: () => Date;
  /** Artificial delay before each call, so the skeleton and its `aria-busy` can be tested. */
  delayMs?: () => number;
}

const DAY = 86_400_000;

const fail = (code: StoreErrorCode, id: StoreMessageId, params?: Record<string, string | number>): never => {
  throw storeError(code, id, params);
};

/** The data store of the browser. It enforces the permission table of SPEC section 7 in code, as row-level security does on the server. */
/** The key shape that the `ui_texts` table accepts (migration 10). */
const UI_TEXT_KEY = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export class LocalStore implements DataStore {
  private state: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;
  constructor(private readonly options: LocalStoreOptions) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private async open(): Promise<Snapshot> {
    const delay = this.options.delayMs?.() ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (this.state) return this.state;
    this.loading ??= this.options.adapter.load().then((s) => (this.state = s ?? this.options.seed()));
    return this.loading;
  }

  private async commit(s: Snapshot): Promise<void> {
    await this.options.adapter.save(s);
  }

  private nextId(s: Snapshot, prefix: string): string {
    s.seq += 1;
    return `${prefix}-${s.seq}`;
  }

  private who(s: Snapshot): User {
    const user = s.users.find((u) => u.id === s.currentUserId) ?? fail('forbidden', 'errors.noUser');
    // The database refuses a locked account at once (D75); the local store does the same.
    if (user.locked) fail('forbidden', 'errors.accountLocked');
    return user;
  }

  private mustBeAdmin(s: Snapshot, what: string): User {
    const u = this.who(s);
    if (u.role !== 'admin') fail('forbidden', 'errors.adminOnly', { what });
    return u;
  }

  /** A copy for the caller, with the owner's name and the group names that the screens show. */
  private view(s: Snapshot, f: FlowRecord): FlowRecord {
    return {
      ...structuredClone(f),
      ownerName: s.users.find((u) => u.id === f.ownerId)?.name ?? 'Unknown',
      groupNames: f.groupIds.map((g) => s.groups.find((x) => x.id === g)?.name ?? g),
    };
  }

  private canSee(u: User, f: FlowRecord): boolean {
    if (u.role === 'admin') return true;
    if (f.deletedAt) return false;
    return f.scope === 'personal' ? f.ownerId === u.id : f.groupIds.some((g) => u.groupIds.includes(g));
  }

  private canEdit(u: User, f: FlowRecord): boolean {
    return u.role === 'admin' || (f.scope === 'personal' && f.ownerId === u.id && !f.deletedAt);
  }

  private flowFor(s: Snapshot, id: string, edit: boolean): FlowRecord {
    const u = this.who(s);
    const f = s.flows.find((x) => x.id === id);
    if (!f || !this.canSee(u, f)) return fail('not_found', 'errors.flowNotFound');
    if (edit && !this.canEdit(u, f)) fail('forbidden', 'errors.sharedFlowReadOnly');
    return f;
  }

  async currentUser(): Promise<User> {
    return structuredClone(this.who(await this.open()));
  }

  /** For tests and the dev tools: sign in as another seeded user. */
  async switchUser(userId: string): Promise<void> {
    const s = await this.open();
    if (!s.users.some((u) => u.id === userId)) fail('not_found', 'errors.userNotFound', { id: userId });
    s.currentUserId = userId;
    await this.commit(s);
  }

  async listUsers(): Promise<User[]> {
    const s = await this.open();
    this.mustBeAdmin(s, 'see the user list');
    return structuredClone(s.users);
  }

  async saveUser(user: User): Promise<User> {
    const s = await this.open();
    this.mustBeAdmin(s, 'change users');
    if (!user.name.trim() || !user.email.includes('@')) fail('invalid', 'errors.userNeedsNameEmail');
    if (!isValidFlowLimit(user.maxFlows)) fail('invalid', 'errors.flowLimitInvalid');
    const i = s.users.findIndex((u) => u.id === user.id);
    if (user.role !== 'admin' && i >= 0 && s.users[i]!.role === 'admin' && !s.users.some((u, j) => j !== i && u.role === 'admin')) {
      fail('conflict', 'errors.lastAdmin');
    }
    if (s.users.some((u, j) => j !== i && u.email.toLowerCase() === user.email.trim().toLowerCase())) {
      fail('conflict', 'errors.emailExists', { email: user.email.trim() });
    }
    const saved = { ...user, maxFlows: user.maxFlows ?? null, name: user.name.trim(), email: user.email.trim(), groupIds: user.groupIds.filter((g) => s.groups.some((x) => x.id === g)), id: user.id || this.nextId(s, 'user') };
    if (i >= 0) s.users[i] = saved;
    else s.users.push(saved);
    await this.commit(s);
    return structuredClone(saved);
  }

  async listGroups(): Promise<Group[]> {
    const s = await this.open();
    this.mustBeAdmin(s, 'see the groups');
    return structuredClone(s.groups);
  }

  async saveGroup(group: { id?: string; name: string }): Promise<Group> {
    const s = await this.open();
    this.mustBeAdmin(s, 'change groups');
    const name = group.name.trim();
    if (!name) fail('invalid', 'errors.groupNeedsName');
    if (s.groups.some((g) => g.id !== group.id && g.name.toLowerCase() === name.toLowerCase())) fail('conflict', 'errors.groupExists', { name });
    let saved: Group;
    if (group.id) {
      const existing = s.groups.find((g) => g.id === group.id) ?? fail('not_found', 'errors.groupGone');
      existing.name = name;
      saved = existing;
    } else {
      saved = { id: this.nextId(s, 'group'), name };
      s.groups.push(saved);
    }
    await this.commit(s);
    return structuredClone(saved);
  }

  async deleteGroup(id: string): Promise<void> {
    const s = await this.open();
    this.mustBeAdmin(s, 'delete groups');
    if (!s.groups.some((g) => g.id === id)) fail('not_found', 'errors.groupGone');
    s.groups = s.groups.filter((g) => g.id !== id);
    for (const u of s.users) u.groupIds = u.groupIds.filter((g) => g !== id);
    for (const f of s.flows) f.groupIds = f.groupIds.filter((g) => g !== id);
    await this.commit(s);
  }

  /** For `LocalAccountAdmin`: runs a change of the accounts as the signed-in admin and saves the snapshot when it succeeds. */
  async changeAccounts(change: (s: Snapshot, actor: User, newId: () => string) => void): Promise<void> {
    const s = await this.open();
    const actor = this.mustBeAdmin(s, 'manage accounts');
    change(s, actor, () => this.nextId(s, 'user'));
    await this.commit(s);
  }

  async accountStatus(): Promise<{ locked: boolean; mustChangePassword: boolean }> {
    const s = await this.open();
    const user = s.users.find((u) => u.id === s.currentUserId) ?? fail('forbidden', 'errors.noUser');
    return { locked: user.locked === true, mustChangePassword: user.mustChangePassword === true };
  }

  async clearMustChangePassword(): Promise<void> {
    const s = await this.open();
    this.who(s).mustChangePassword = false;
    await this.commit(s);
  }

  async getAppSettings(): Promise<AppSettings> {
    const s = await this.open();
    return { idleTimeoutHours: s.appSettings?.idle_timeout_hours ?? DEFAULT_IDLE_TIMEOUT_HOURS };
  }

  async saveAppSetting(key: AppSettingKey, value: number): Promise<AppSettings> {
    const s = await this.open();
    this.mustBeAdmin(s, 'change the settings');
    if (key !== 'idle_timeout_hours' || !isValidIdleHours(value)) fail('invalid', 'errors.idleHoursInvalid');
    s.appSettings = { ...s.appSettings, idle_timeout_hours: value };
    await this.commit(s);
    return { idleTimeoutHours: value };
  }

  async listUiTexts(): Promise<UiText[]> {
    const s = await this.open();
    return structuredClone(s.uiTexts ?? []);
  }

  async saveUiTexts({ entries, resets }: UiTextChanges): Promise<void> {
    const s = await this.open();
    this.mustBeAdmin(s, 'edit texts');
    // Check everything first, so a bad entry changes nothing (the server does the same in one transaction).
    for (const e of [...entries, ...resets]) {
      if ((e.locale as string) !== 'en' && (e.locale as string) !== 'vi') fail('invalid', 'errors.textInvalid');
      if (!UI_TEXT_KEY.test(e.key) || e.key.length > 120) fail('invalid', 'errors.textInvalid');
    }
    for (const e of entries) if (e.value.trim() === '' || e.value.length > 2000) fail('invalid', 'errors.textEmpty');
    const stamp = this.now().toISOString();
    let list = s.uiTexts ?? [];
    for (const e of entries) {
      const saved: UiText = { locale: e.locale, key: e.key, value: e.value, updatedAt: stamp };
      const at = list.findIndex((t) => t.locale === e.locale && t.key === e.key);
      if (at >= 0) list[at] = saved;
      else list.push(saved);
    }
    list = list.filter((t) => !resets.some((r) => r.locale === t.locale && r.key === t.key));
    s.uiTexts = list;
    await this.commit(s);
  }

  async listFlows(): Promise<FlowRecord[]> {
    const s = await this.open();
    const u = this.who(s);
    return s.flows.filter((f) => !f.deletedAt && this.canSee(u, f)).map((f) => this.view(s, f));
  }

  async getFlow(id: string): Promise<FlowRecord> {
    const s = await this.open();
    return this.view(s, this.flowFor(s, id, false));
  }

  /** The limit that the admin set on this user: the flows they own that are not deleted. An admin has none. */
  private checkFlowLimit(s: Snapshot, u: User): void {
    if (u.role === 'admin' || u.maxFlows == null) return;
    const owned = s.flows.filter((f) => f.ownerId === u.id && !f.deletedAt).length;
    if (owned >= u.maxFlows) fail('conflict', 'errors.flowLimit', { max: u.maxFlows });
  }

  async createFlow({ name, scope }: { name: string; scope: Scope }): Promise<FlowRecord> {
    const s = await this.open();
    const u = this.who(s);
    if (!name.trim()) fail('invalid', 'errors.flowNeedsName');
    if (scope === 'shared' && u.role !== 'admin') fail('forbidden', 'errors.sharedFlowAdminOnly');
    this.checkFlowLimit(s, u);
    const flow: FlowRecord = {
      id: this.nextId(s, 'flow'),
      name: name.trim(),
      ownerId: u.id,
      scope,
      deletedAt: null,
      groupIds: [],
      versions: [draftVersion(1, this.now().toISOString().slice(0, 10), 'First version', { schemaVersion: 1, nodes: [], edges: [] })],
    };
    s.flows.push(flow);
    await this.commit(s);
    return structuredClone(flow);
  }

  async copyFlow(id: string, name: string): Promise<FlowRecord> {
    const s = await this.open();
    const u = this.who(s);
    const src = this.flowFor(s, id, false);
    this.checkFlowLimit(s, u);
    const latest = [...src.versions].sort((a, b) => b.versionNo - a.versionNo)[0];
    const copy: FlowRecord = {
      id: this.nextId(s, 'flow'),
      name: name.trim() || `${src.name} (copy)`,
      ownerId: u.id,
      scope: 'personal',
      deletedAt: null,
      groupIds: [],
      versions: [draftVersion(1, latest?.validFrom ?? this.now().toISOString().slice(0, 10), `Copied from ${src.name}`, structuredClone(latest?.definition ?? { schemaVersion: 1, nodes: [], edges: [] }))],
    };
    s.flows.push(copy);
    await this.commit(s);
    return structuredClone(copy);
  }

  async setFlowGroups(id: string, groupIds: string[]): Promise<FlowRecord> {
    const s = await this.open();
    this.mustBeAdmin(s, 'change who can use a shared flow');
    const f = this.flowFor(s, id, true);
    if (f.scope !== 'shared') fail('invalid', 'errors.notSharedFlow');
    f.groupIds = groupIds.filter((g) => s.groups.some((x) => x.id === g));
    await this.commit(s);
    return structuredClone(f);
  }

  async deleteFlow(id: string): Promise<void> {
    const s = await this.open();
    this.flowFor(s, id, true).deletedAt = this.now().toISOString();
    await this.commit(s);
  }

  async listDeletedFlows(): Promise<FlowRecord[]> {
    const s = await this.open();
    this.mustBeAdmin(s, 'see deleted flows');
    return s.flows.filter((f) => f.deletedAt).map((f) => this.view(s, f));
  }

  private deletedFlow(s: Snapshot, id: string): FlowRecord {
    this.mustBeAdmin(s, 'restore or remove deleted flows');
    const f = s.flows.find((x) => x.id === id && x.deletedAt);
    return f ?? fail('not_found', 'errors.flowNotDeleted');
  }

  async restoreFlow(id: string): Promise<FlowRecord> {
    const s = await this.open();
    const f = this.deletedFlow(s, id);
    f.deletedAt = null;
    await this.commit(s);
    return structuredClone(f);
  }

  async purgeFlow(id: string): Promise<void> {
    const s = await this.open();
    this.deletedFlow(s, id);
    s.flows = s.flows.filter((f) => f.id !== id);
    await this.commit(s);
  }

  async purgeExpired(): Promise<number> {
    const s = await this.open();
    this.mustBeAdmin(s, 'remove deleted flows');
    const limit = this.now().getTime() - KEEP_DELETED_DAYS * DAY;
    const before = s.flows.length;
    s.flows = s.flows.filter((f) => !f.deletedAt || Date.parse(f.deletedAt) > limit);
    await this.commit(s);
    return before - s.flows.length;
  }

  private versionOf<T extends VersionRange & { status: string }>(versions: T[], no: number, forEdit: boolean): T {
    const v = versions.find((x) => x.versionNo === no) ?? fail('not_found', 'errors.versionNotFound', { n: no });
    if (forEdit && v.status === 'published') fail('conflict', 'errors.versionReadOnly', { n: no });
    return v;
  }

  async saveFlowVersion(flowId: string, versionNo: number, patch: VersionPatch): Promise<FlowRecord> {
    const s = await this.open();
    const f = this.flowFor(s, flowId, true);
    const v = this.versionOf(f.versions, versionNo, true);
    checkRange(patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    if (patch.validFrom !== undefined || patch.validTo !== undefined) checkDraftRange(f.versions, versionNo, patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    Object.assign(v, patch);
    await this.commit(s);
    return structuredClone(f);
  }

  async createFlowVersion(flowId: string, input: { validFrom: string; copyFrom?: number; changeNote?: string }): Promise<FlowRecord> {
    const s = await this.open();
    const f = this.flowFor(s, flowId, true);
    checkRange(input.validFrom, null);
    const source = input.copyFrom === undefined ? undefined : this.versionOf(f.versions, input.copyFrom, false);
    const no = Math.max(0, ...f.versions.map((v) => v.versionNo)) + 1;
    f.versions.push(draftVersion(no, input.validFrom, input.changeNote ?? '', structuredClone(source?.definition ?? { schemaVersion: 1, nodes: [], edges: [] })));
    await this.commit(s);
    return structuredClone(f);
  }

  async publishFlowVersion(flowId: string, versionNo: number): Promise<FlowRecord> {
    const s = await this.open();
    const f = this.flowFor(s, flowId, true);
    publish(f.versions, versionNo, `flow "${f.name}"`);
    await this.commit(s);
    return structuredClone(f);
  }

  async listRefTables(): Promise<RefTableView[]> {
    const s = await this.open();
    const u = this.who(s);
    // The same rule as the database (migration 17): the rows are for the admin and for a table that a live flow of the person reads.
    const flows = s.flows.filter((f) => !f.deletedAt && this.canSee(u, f));
    return s.refTables.map((table) => {
      const usedBy = flows.filter((f) => f.versions.some((v) => referencedTables(v.definition).includes(table.name))).map((f) => f.name);
      const readable = u.role === 'admin' || usedBy.length > 0;
      const names = [...new Set(usedBy)].sort((a, b) => a.localeCompare(b));
      return structuredClone({ ...table, versions: readable ? table.versions : [], usedBy: names });
    });
  }

  private tableFor(s: Snapshot, id: string): RefTableRecord {
    this.mustBeAdmin(s, 'change reference tables');
    return s.refTables.find((t) => t.id === id) ?? fail('not_found', 'errors.refTableNotFound');
  }

  async createRefTable({ name, description, columns }: { name: string; description: string; columns: RefTableVersionRecord['columns'] }): Promise<RefTableRecord> {
    const s = await this.open();
    this.mustBeAdmin(s, 'create reference tables');
    if (!name.trim()) fail('invalid', 'errors.refTableNeedsName');
    if (s.refTables.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) fail('conflict', 'errors.refTableExists', { name: name.trim() });
    const table: RefTableRecord = {
      id: this.nextId(s, 'ref'),
      name: name.trim(),
      description,
      versions: [{ versionNo: 1, validFrom: this.now().toISOString().slice(0, 10), validTo: null, status: 'draft', columns, rows: [] }],
    };
    s.refTables.push(table);
    await this.commit(s);
    return structuredClone(table);
  }

  async saveRefTableVersion(tableId: string, versionNo: number, patch: RefVersionPatch): Promise<RefTableRecord> {
    const s = await this.open();
    const t = this.tableFor(s, tableId);
    const v = this.versionOf(t.versions, versionNo, true);
    if (patch.rows) checkRowCap(patch.rows.length);
    checkRange(patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    if (patch.validFrom !== undefined || patch.validTo !== undefined) checkDraftRange(t.versions, versionNo, patch.validFrom ?? v.validFrom, patch.validTo === undefined ? v.validTo : patch.validTo);
    Object.assign(v, patch);
    await this.commit(s);
    return structuredClone(t);
  }

  async createRefTableVersion(tableId: string, input: { validFrom: string; copyFrom?: number }): Promise<RefTableRecord> {
    const s = await this.open();
    const t = this.tableFor(s, tableId);
    checkRange(input.validFrom, null);
    const src = input.copyFrom === undefined ? undefined : this.versionOf(t.versions, input.copyFrom, false);
    const no = Math.max(0, ...t.versions.map((v) => v.versionNo)) + 1;
    t.versions.push({ versionNo: no, validFrom: input.validFrom, validTo: null, status: 'draft', columns: structuredClone(src?.columns ?? []), rows: structuredClone(src?.rows ?? []) });
    await this.commit(s);
    return structuredClone(t);
  }

  async updateRefTable(tableId: string, patch: { description: string }): Promise<RefTableRecord> {
    const s = await this.open();
    this.mustBeAdmin(s, 'change reference tables');
    const t = this.tableFor(s, tableId);
    t.description = patch.description;
    await this.commit(s);
    return structuredClone(t);
  }

  async deleteRefTable(tableId: string): Promise<void> {
    const s = await this.open();
    const table = this.tableFor(s, tableId);
    // A live flow that reads the table (in any version) keeps it: flows point to a table by its name.
    const readers = s.flows.filter((f) => !f.deletedAt && f.versions.some((v) => referencedTables(v.definition).includes(table.name))).map((f) => f.name);
    if (readers.length > 0) fail('conflict', 'errors.refTableInUse', { name: table.name, flows: [...new Set(readers)].sort((a, b) => a.localeCompare(b)).join(', ') });
    s.refTables = s.refTables.filter((x) => x.id !== tableId);
    await this.commit(s);
  }

  async importRefTable(input: RefImportInput): Promise<RefImportResult> {
    this.mustBeAdmin(await this.open(), 'import reference tables');
    return importRefTableVia(this, input);
  }

  async publishRefTableVersion(tableId: string, versionNo: number): Promise<RefTableRecord> {
    const s = await this.open();
    const t = this.tableFor(s, tableId);
    publish(t.versions, versionNo, `reference table "${t.name}"`);
    await this.commit(s);
    return structuredClone(t);
  }

  async addRunLog(entry: Omit<RunLogEntry, 'id' | 'userId' | 'runAt'>): Promise<RunLogEntry> {
    const s = await this.open();
    const u = this.who(s);
    this.flowFor(s, entry.flowId, false);
    const row: RunLogEntry = { ...entry, id: this.nextId(s, 'run'), userId: u.id, runAt: this.now().toISOString() };
    s.runLog.push(row);
    await this.commit(s);
    return structuredClone(row);
  }

  async listRunLog(flowId: string): Promise<RunLogEntry[]> {
    const s = await this.open();
    this.flowFor(s, flowId, false);
    return structuredClone(s.runLog.filter((r) => r.flowId === flowId));
  }
}

const draftVersion = (versionNo: number, validFrom: string, changeNote: string, definition: unknown): FlowVersionRecord => ({
  versionNo,
  validFrom,
  validTo: null,
  status: 'draft',
  changeNote,
  definition,
});


/**
 * Publishes a draft (rules 5 and 6 of SPEC section 4): the previous open-ended published version ends the day before this
 * one starts, and the published versions must not overlap. Nothing changes when the check fails.
 */
function publish<T extends VersionRange & { status: 'draft' | 'published' }>(versions: T[], versionNo: number, what: string): void {
  const plan = planPublish(versions, versionNo, what);
  if (!plan.ok) throw new StoreError(plan.kind === 'not_found' ? 'not_found' : 'conflict', plan.message); // the engine's text, English
  versions.find((x) => x.versionNo === versionNo)!.status = 'published';
  if (plan.ends) versions.find((x) => x.versionNo === plan.ends!.versionNo)!.validTo = plan.ends.validTo;
}
