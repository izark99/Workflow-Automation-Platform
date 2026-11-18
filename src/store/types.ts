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

export const MAX_REF_ROWS = 50_000;
/** A deleted flow is kept this many days. */
export const KEEP_DELETED_DAYS = 30;

export type StoreErrorCode = 'not_found' | 'forbidden' | 'invalid' | 'conflict';

/** Every message says what failed and what to do next. */
export type UiTextLocale = 'en' | 'vi';

/** An edited text: the value replaces the default of the catalog for that locale. */
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
  /** The edited UI texts (SPEC 11.3). Everyone reads them, also before signing in; only an admin changes them. */
  listUiTexts(): Promise<UiText[]>;
  saveUiText(input: { locale: UiTextLocale; key: string; value: string }): Promise<UiText>;
  resetUiText(locale: UiTextLocale, key: string): Promise<void>;

  saveFlowVersion(flowId: string, versionNo: number, patch: VersionPatch): Promise<FlowRecord>;
  /** A new draft, copied from `copyFrom` when given. */
  createFlowVersion(flowId: string, input: { validFrom: string; copyFrom?: number; changeNote?: string }): Promise<FlowRecord>;
  /** Publishing ends the previous open-ended version the day before (SPEC section 4, rule 6). */
  publishFlowVersion(flowId: string, versionNo: number): Promise<FlowRecord>;

  listRefTables(): Promise<RefTableRecord[]>;
  createRefTable(input: { name: string; description: string; columns: Column[] }): Promise<RefTableRecord>;
  saveRefTableVersion(tableId: string, versionNo: number, patch: RefVersionPatch): Promise<RefTableRecord>;
  createRefTableVersion(tableId: string, input: { validFrom: string; copyFrom?: number }): Promise<RefTableRecord>;
  publishRefTableVersion(tableId: string, versionNo: number): Promise<RefTableRecord>;

  addRunLog(entry: Omit<RunLogEntry, 'id' | 'userId' | 'runAt'>): Promise<RunLogEntry>;
  listRunLog(flowId: string): Promise<RunLogEntry[]>;
}
