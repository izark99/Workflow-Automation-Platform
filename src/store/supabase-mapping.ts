// Rows of the database (snake_case, as PostgREST returns them) to the records of the DataStore (camelCase).
// Pure functions, no client: the unit tests cover them, the integration test of T3.6c covers the queries.
import type { Cell, Column } from '../engine/types';
import type {
  FlowRecord,
  FlowVersionRecord,
  Group,
  RefTableRecord,
  RefTableVersionRecord,
  Role,
  RefVersionPatch,
  RunLogEntry,
  Scope,
  User,
  VersionPatch,
} from './types';

export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface GroupRow {
  id: string;
  name: string;
}

export interface FlowVersionRow {
  version_no: number;
  valid_from: string;
  valid_to: string | null;
  status: 'draft' | 'published';
  change_note: string;
  definition: unknown;
}

export interface FlowRow {
  id: string;
  name: string;
  owner_id: string;
  scope: Scope;
  deleted_at: string | null;
  flow_versions?: FlowVersionRow[];
  flow_group_access?: { group_id: string }[];
}

export interface RefTableVersionRow {
  version_no: number;
  valid_from: string;
  valid_to: string | null;
  status: 'draft' | 'published';
  columns: Column[];
  rows: Cell[][];
}

export interface RefTableRow {
  id: string;
  name: string;
  description: string;
  ref_table_versions?: RefTableVersionRow[];
}

export interface RunLogRow {
  id: string;
  flow_id: string;
  version_no: number;
  user_id: string;
  effective_date: string;
  run_at: string;
  input_rows: number;
  output_rows: number;
  status: 'ok' | 'failed';
}

/** Names the caller may read. A non-admin reads only the own profile and no groups (decision D59). */
export interface NameLookup {
  users: Map<string, string>;
  groups: Map<string, string>;
}

export interface VisibleNameRow {
  kind: 'user' | 'group';
  id: string;
  name: string;
}

/** The rows of `visible_names()`: the owners and groups of the flows the caller can see. */
export function namesFromRows(rows: VisibleNameRow[]): NameLookup {
  const names: NameLookup = { users: new Map(), groups: new Map() };
  for (const r of rows) (r.kind === 'user' ? names.users : names.groups).set(r.id, r.name);
  return names;
}

export const userFromRows = (p: ProfileRow, groupIds: string[]): User => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  groupIds,
});

export const groupFromRow = (g: GroupRow): Group => ({ id: g.id, name: g.name });

const byNumber = (a: { version_no: number }, b: { version_no: number }) => a.version_no - b.version_no;

const flowVersionFromRow = (v: FlowVersionRow): FlowVersionRecord => ({
  versionNo: v.version_no,
  validFrom: v.valid_from,
  validTo: v.valid_to,
  status: v.status,
  changeNote: v.change_note,
  definition: v.definition,
});

export function flowFromRow(row: FlowRow, names: NameLookup): FlowRecord {
  const groupIds = (row.flow_group_access ?? []).map((a) => a.group_id);
  const known = groupIds.filter((id) => names.groups.has(id));
  groupIds.sort((a, b) => (names.groups.get(a) ?? a).localeCompare(names.groups.get(b) ?? b));
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    scope: row.scope,
    deletedAt: row.deleted_at,
    groupIds,
    versions: [...(row.flow_versions ?? [])].sort(byNumber).map(flowVersionFromRow),
    ownerName: names.users.get(row.owner_id) ?? 'Unknown',
    groupNames: known.length === 0 ? [] : groupIds.map((id) => names.groups.get(id) ?? id),
  };
}

const refVersionFromRow = (v: RefTableVersionRow): RefTableVersionRecord => ({
  versionNo: v.version_no,
  validFrom: v.valid_from,
  validTo: v.valid_to,
  status: v.status,
  columns: v.columns,
  rows: v.rows,
});

export const refTableFromRow = (row: RefTableRow): RefTableRecord => ({
  id: row.id,
  name: row.name,
  description: row.description,
  versions: [...(row.ref_table_versions ?? [])].sort(byNumber).map(refVersionFromRow),
});

export const runLogFromRow = (r: RunLogRow): RunLogEntry => ({
  id: r.id,
  flowId: r.flow_id,
  versionNo: r.version_no,
  userId: r.user_id,
  effectiveDate: r.effective_date,
  runAt: r.run_at,
  inputRows: r.input_rows,
  outputRows: r.output_rows,
  status: r.status,
});

/** Only the fields that are in the patch, so an update never writes a field the caller did not set. */
export function versionPatchToRow(patch: VersionPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.validFrom !== undefined) row.valid_from = patch.validFrom;
  if (patch.validTo !== undefined) row.valid_to = patch.validTo;
  if (patch.changeNote !== undefined) row.change_note = patch.changeNote;
  if (patch.definition !== undefined) row.definition = patch.definition;
  return row;
}

export function refPatchToRow(patch: RefVersionPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.validFrom !== undefined) row.valid_from = patch.validFrom;
  if (patch.validTo !== undefined) row.valid_to = patch.validTo;
  if (patch.columns !== undefined) row.columns = patch.columns;
  if (patch.rows !== undefined) row.rows = patch.rows;
  return row;
}

export const runLogToRow = (entry: Omit<RunLogEntry, 'id' | 'userId' | 'runAt'>, userId: string): Record<string, unknown> => ({
  flow_id: entry.flowId,
  version_no: entry.versionNo,
  user_id: userId,
  effective_date: entry.effectiveDate,
  input_rows: entry.inputRows,
  output_rows: entry.outputRows,
  status: entry.status,
});
