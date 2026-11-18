import { describe, expect, it } from 'vitest';
import {
  groupFromRow,
  flowFromRow,
  refTableFromRow,
  runLogFromRow,
  userFromRows,
  type FlowRow,
  type RefTableRow,
} from './supabase-mapping';

const version = (no: number, extra: object = {}) => ({
  version_no: no,
  valid_from: '2026-01-01',
  valid_to: null,
  status: 'published' as const,
  change_note: 'note',
  definition: { nodes: [] },
  ...extra,
});

describe('userFromRows', () => {
  it('maps a profile and its group ids', () => {
    expect(userFromRows({ id: 'u1', name: 'Ann', email: 'ann@example.test', role: 'admin' }, ['g1', 'g2'])).toEqual({
      id: 'u1',
      name: 'Ann',
      email: 'ann@example.test',
      role: 'admin',
      groupIds: ['g1', 'g2'],
    });
  });
});

describe('groupFromRow', () => {
  it('keeps id and name only', () => {
    expect(groupFromRow({ id: 'g1', name: 'HR' })).toEqual({ id: 'g1', name: 'HR' });
  });
});

describe('flowFromRow', () => {
  const row: FlowRow = {
    id: 'f1',
    name: 'Timesheet',
    owner_id: 'u1',
    scope: 'shared',
    deleted_at: null,
    flow_versions: [version(2, { status: 'draft', valid_from: '2026-07-01' }), version(1, { valid_to: '2026-06-30' })],
    flow_group_access: [{ group_id: 'g2' }, { group_id: 'g1' }],
  };

  it('maps columns to camelCase and sorts versions by number', () => {
    const f = flowFromRow(row, { users: new Map([['u1', 'Ann']]), groups: new Map([['g1', 'HR'], ['g2', 'Ops']]) });
    expect(f.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    expect(f.versions[0]).toEqual({
      versionNo: 1,
      validFrom: '2026-01-01',
      validTo: '2026-06-30',
      status: 'published',
      changeNote: 'note',
      definition: { nodes: [] },
    });
    expect(f.versions[1]?.status).toBe('draft');
    expect(f).toMatchObject({ id: 'f1', name: 'Timesheet', ownerId: 'u1', scope: 'shared', deletedAt: null });
  });

  it('fills owner and group names, and keeps group ids sorted by name', () => {
    const f = flowFromRow(row, { users: new Map([['u1', 'Ann']]), groups: new Map([['g1', 'HR'], ['g2', 'Ops']]) });
    expect(f.ownerName).toBe('Ann');
    expect(f.groupIds).toEqual(['g1', 'g2']);
    expect(f.groupNames).toEqual(['HR', 'Ops']);
  });

  it('says Unknown for an owner the caller cannot read, and leaves group names out when the caller cannot read groups', () => {
    const f = flowFromRow(row, { users: new Map(), groups: new Map() });
    expect(f.ownerName).toBe('Unknown');
    expect(f.groupIds).toEqual(['g1', 'g2']);
    expect(f.groupNames).toEqual([]);
  });

  it('copes with a flow that came without versions or access rows', () => {
    const f = flowFromRow({ id: 'f2', name: 'Bare', owner_id: 'u1', scope: 'personal', deleted_at: '2026-11-01T10:00:00+00:00' }, {
      users: new Map(),
      groups: new Map(),
    });
    expect(f.versions).toEqual([]);
    expect(f.groupIds).toEqual([]);
    expect(f.deletedAt).toBe('2026-11-01T10:00:00+00:00');
  });
});

describe('refTableFromRow', () => {
  it('maps versions with columns and rows', () => {
    const row: RefTableRow = {
      id: 't1',
      name: 'Limits',
      description: 'OT limits',
      ref_table_versions: [
        { version_no: 2, valid_from: '2026-07-01', valid_to: null, status: 'draft', columns: [{ name: 'A', type: 'text' }], rows: [['x']] },
        { version_no: 1, valid_from: '2026-01-01', valid_to: '2026-06-30', status: 'published', columns: [{ name: 'A', type: 'text' }], rows: [] },
      ],
    };
    const t = refTableFromRow(row);
    expect(t.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    expect(t.versions[1]).toEqual({
      versionNo: 2,
      validFrom: '2026-07-01',
      validTo: null,
      status: 'draft',
      columns: [{ name: 'A', type: 'text' }],
      rows: [['x']],
    });
    expect(t).toMatchObject({ id: 't1', name: 'Limits', description: 'OT limits' });
  });
});

describe('runLogFromRow', () => {
  it('maps counts and ids only', () => {
    expect(
      runLogFromRow({
        id: 'r1',
        flow_id: 'f1',
        version_no: 3,
        user_id: 'u1',
        effective_date: '2026-09-30',
        run_at: '2026-10-01T08:00:00+00:00',
        input_rows: 10,
        output_rows: 4,
        status: 'ok',
      }),
    ).toEqual({
      id: 'r1',
      flowId: 'f1',
      versionNo: 3,
      userId: 'u1',
      effectiveDate: '2026-09-30',
      runAt: '2026-10-01T08:00:00+00:00',
      inputRows: 10,
      outputRows: 4,
      status: 'ok',
    });
  });
});
