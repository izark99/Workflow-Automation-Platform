/**
 * The one door between the screens and the data (decision D37). Every method is async, because the Supabase
 * implementation in Phase 3 is. Permissions follow SPEC section 7; an implementation enforces them itself.
 */
import type { Cell, Column } from '../engine/types';
import type { VersionRange } from '../engine/versions';
import { storeText } from './messages';
import type { StoreMessageId } from './messages';

export type Role = 'admin' | 'user';
export type Scope = 'personal' | 'shared';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  groupIds: string[];
  /** The account is locked by an admin (SPEC 11.1): it cannot sign in and reads nothing. */
  locked?: boolean;
  /** The user must choose a new password at the next sign-in. */
  mustChangePassword?: boolean;
}

export interface Group {
  id: string;
  name: string;
}

export interface FlowVersionRecord extends VersionRange {
  status: 'draft' | 'published';
  changeNote: string;
  /** The flow definition JSON. The canvas writes it and the engine runs it. */
  definition: unknown;
}

export interface FlowRecord {
  id: string;
  name: string;
  ownerId: string;
  scope: Scope;
  /** ISO date-time of the soft delete, or null. */
  deletedAt: string | null;
  /** Groups that can view and run a shared flow. */
  groupIds: string[];
  versions: FlowVersionRecord[];
  /** Filled by the store when it reads: the owner's name and the names of the groups with access. */
  ownerName?: string;
  groupNames?: string[];
}

export interface RefTableVersionRecord extends VersionRange {
  status: 'draft' | 'published';
  columns: Column[];
  rows: Cell[][];
}

/** A table as `listRefTables()` returns it: the versions only where the caller may read them, and the flows that use it. */
export type RefTableView = RefTableRecord & {
  /** The names of the live flows that the caller may view and that read this table, in any version. At most one name per flow. */
  usedBy: string[];
};

export interface RefTableRecord {
  id: string;
  name: string;
  description: string;
  versions: RefTableVersionRecord[];
}

/** Run history. Metadata only: no input data, no names. */
export interface RunLogEntry {
  id: string;
  flowId: string;
  versionNo: number;
  userId: string;
  effectiveDate: string;
  runAt: string;
  inputRows: number;
  outputRows: number;
  status: 'ok' | 'failed';
}

export interface VersionPatch {
  validFrom?: string;
  validTo?: string | null;
  changeNote?: string;
  definition?: unknown;
}

export interface RefVersionPatch {
  validFrom?: string;
  validTo?: string | null;
  columns?: Column[];
  rows?: Cell[][];
}

/** Where an imported file goes (SPEC 12.1 item 2). */
export type RefImportTarget =
  | { kind: 'newTable'; name: string; description: string }
  | { kind: 'newVersion'; tableId: string; validFrom: string }
  | { kind: 'replaceDraft'; tableId: string; versionNo: number };

export interface RefImportInput {
  target: RefImportTarget;
  columns: Column[];
  rows: Cell[][];
}

export interface RefImportResult {
  table: RefTableRecord;
  /** The draft that the import made or filled. */
  versionNo: number;
}

export const MAX_REF_ROWS = 50_000;
/** A deleted flow is kept this many days. */
export const KEEP_DELETED_DAYS = 30;

export type StoreErrorCode = 'not_found' | 'forbidden' | 'invalid' | 'conflict';

/** Every message says what failed and what to do next. */
export type UiTextLocale = 'en' | 'vi';

/** What one Save of the Texts tab sends: texts to store, and texts to take back to their default. */
export interface UiTextChanges {
  entries: { locale: UiTextLocale; key: string; value: string }[];
  resets: { locale: UiTextLocale; key: string }[];
}

/** An edited text: the value replaces the default of the catalog for that locale. */
/** Settings that the admin sets for everyone (SPEC 12.2). */
export interface AppSettings {
  /** Hours without activity before a user is signed out: a whole number from 1 to 72. */
  idleTimeoutHours: number;
}
export type AppSettingKey = 'idle_timeout_hours';
export const DEFAULT_IDLE_TIMEOUT_HOURS = 8;
export const IDLE_TIMEOUT_RANGE = { min: 1, max: 72 } as const;
export const isValidIdleHours = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= IDLE_TIMEOUT_RANGE.min && v <= IDLE_TIMEOUT_RANGE.max;

export interface UiText {
  locale: UiTextLocale;
  key: string;
  value: string;
  updatedAt: string;
}

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  /** Id of the message in the catalog and its parameters. Without an id the English `message` is shown. */
  readonly messageId: string | undefined;
  readonly params: Record<string, string | number> | undefined;
  constructor(code: StoreErrorCode, message: string, detail?: { messageId: string; params?: Record<string, string | number> }) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.messageId = detail?.messageId;
    this.params = detail?.params;
  }
}

/** A store error with a message id: the message is the English template filled with the parameters. */
export function storeError(code: StoreErrorCode, messageId: StoreMessageId, params: Record<string, string | number> = {}): StoreError {
  return new StoreError(code, storeText(messageId, params), { messageId, params });
}

export interface DataStore {
  currentUser(): Promise<User>;

  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<User>;
  listGroups(): Promise<Group[]>;
  /** Admin only. Creates a group (no id) or renames one. */
  saveGroup(group: { id?: string; name: string }): Promise<Group>;
  /** Admin only. Removes the group from every user and every shared flow. */
  deleteGroup(id: string): Promise<void>;

  /** The flows the current user may see, without deleted ones. */
  listFlows(): Promise<FlowRecord[]>;
  getFlow(id: string): Promise<FlowRecord>;
  createFlow(input: { name: string; scope: Scope }): Promise<FlowRecord>;
  /** A user copies a shared flow into a personal flow (SPEC section 7). The copy has one draft version. */
  copyFlow(id: string, name: string): Promise<FlowRecord>;
  setFlowGroups(id: string, groupIds: string[]): Promise<FlowRecord>;
  deleteFlow(id: string): Promise<void>;
  /** Admin only. */
  listDeletedFlows(): Promise<FlowRecord[]>;
  restoreFlow(id: string): Promise<FlowRecord>;
  /** Admin only. Removes a deleted flow for good. */
  purgeFlow(id: string): Promise<void>;
  /** Admin only. Removes the deleted flows that were kept longer than 30 days. Returns how many. */
  purgeExpired(): Promise<number>;
  /** The own account: locked by an admin, or the password must be changed. Readable even when the account is locked. */
  accountStatus(): Promise<{ locked: boolean; mustChangePassword: boolean }>;
  /** After the user chose a new password. */
  clearMustChangePassword(): Promise<void>;
  /** The edited UI texts (SPEC 11.3). Everyone reads them, also before signing in; only an admin changes them. */
  /** Readable by every signed-in user. A missing row gives the default. */
  getAppSettings(): Promise<AppSettings>;
  /** Admin only. The value is checked here and by the database. */
  saveAppSetting(key: AppSettingKey, value: number): Promise<AppSettings>;
  listUiTexts(): Promise<UiText[]>;
  /** Saves and resets texts of both languages in one action: every change is stored, or none (SPEC 12.3). */
  saveUiTexts(input: UiTextChanges): Promise<void>;

  saveFlowVersion(flowId: string, versionNo: number, patch: VersionPatch): Promise<FlowRecord>;
  /** A new draft, copied from `copyFrom` when given. */
  createFlowVersion(flowId: string, input: { validFrom: string; copyFrom?: number; changeNote?: string }): Promise<FlowRecord>;
  /** Publishing ends the previous open-ended version the day before (SPEC section 4, rule 6). */
  publishFlowVersion(flowId: string, versionNo: number): Promise<FlowRecord>;

  /**
   * Every table with its name and description. The versions (columns and rows) come only for the admin and for a table that a
   * flow of the caller reads (SPEC 12.1); `usedBy` names those flows. For a table nobody may read the versions are empty.
   */
  listRefTables(): Promise<RefTableView[]>;
  createRefTable(input: { name: string; description: string; columns: Column[] }): Promise<RefTableRecord>;
  saveRefTableVersion(tableId: string, versionNo: number, patch: RefVersionPatch): Promise<RefTableRecord>;
  createRefTableVersion(tableId: string, input: { validFrom: string; copyFrom?: number }): Promise<RefTableRecord>;
  publishRefTableVersion(tableId: string, versionNo: number): Promise<RefTableRecord>;
  /** Admin only. Changes the description of a table. The name does not change: flows point to a table by its name. */
  updateRefTable(tableId: string, patch: { description: string }): Promise<RefTableRecord>;
  /** Admin only. Makes or fills a draft from a read file; never publishes. */
  importRefTable(input: RefImportInput): Promise<RefImportResult>;

  addRunLog(entry: Omit<RunLogEntry, 'id' | 'userId' | 'runAt'>): Promise<RunLogEntry>;
  listRunLog(flowId: string): Promise<RunLogEntry[]>;
}
