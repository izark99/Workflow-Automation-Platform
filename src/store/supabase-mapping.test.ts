import { describe, expect, it } from 'vitest';
import {
  appSettingsFromRows,
  groupFromRow,
  flowFromRow,
  namesFromRows,
  refTableFromRow,
  refPatchToRow,
  runLogFromRow,
  runLogToRow,
  usedByFromRows,
  userFromRows,
  versionPatchToRow,
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
  it('maps the lock and the password flag of a profile', () => {
    const u = userFromRows({ id: 'u2', name: 'Bo', email: 'bo@example.test', role: 'user', locked_at: '2026-11-18T08:00:00Z', must_change_password: true }, []);
    expect(u).toMatchObject({ locked: true, mustChangePassword: true });
  });

  it('maps the number of flows of a profile: a number is the limit, a missing value is no limit', () => {
    expect(userFromRows({ id: 'u3', name: 'Cy', email: 'cy@example.test', role: 'user', max_flows: 7 }, []).maxFlows).toBe(7);
    expect(userFromRows({ id: 'u3', name: 'Cy', email: 'cy@example.test', role: 'user', max_flows: 0 }, []).maxFlows).toBe(0);
    expect(userFromRows({ id: 'u3', name: 'Cy', email: 'cy@example.test', role: 'user', max_flows: null }, []).maxFlows).toBeNull();
  });

  it('maps a profile and its group ids', () => {
    expect(userFromRows({ id: 'u1', name: 'Ann', email: 'ann@example.test', role: 'admin' }, ['g1', 'g2'])).toEqual({
      id: 'u1',
      name: 'Ann',
      email: 'ann@example.test',
      role: 'admin',
      groupIds: ['g1', 'g2'],
      locked: false,
      maxFlows: null,
      mustChangePassword: false,
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

describe('versionPatchToRow', () => {
  it('maps only the fields that are in the patch', () => {
    expect(versionPatchToRow({ validFrom: '2026-02-01', changeNote: 'n' })).toEqual({ valid_from: '2026-02-01', change_note: 'n' });
    expect(versionPatchToRow({})).toEqual({});
  });

  it('keeps an explicit null end date and a definition', () => {
    expect(versionPatchToRow({ validTo: null, definition: { nodes: [] } })).toEqual({ valid_to: null, definition: { nodes: [] } });
  });
});

describe('refPatchToRow', () => {
  it('maps dates, columns and rows', () => {
    expect(refPatchToRow({ validFrom: '2026-02-01', validTo: '2026-03-01', columns: [{ name: 'A', type: 'text' }], rows: [['x']] })).toEqual({
      valid_from: '2026-02-01',
      valid_to: '2026-03-01',
      columns: [{ name: 'A', type: 'text' }],
      rows: [['x']],
    });
    expect(refPatchToRow({})).toEqual({});
  });
});

describe('runLogToRow', () => {
  it('writes counts and ids only, with the caller as the user', () => {
    expect(
      runLogToRow({ flowId: 'f1', versionNo: 2, effectiveDate: '2026-09-30', inputRows: 5, outputRows: 3, status: 'failed' }, 'u9'),
    ).toEqual({
      flow_id: 'f1',
      version_no: 2,
      user_id: 'u9',
      effective_date: '2026-09-30',
      input_rows: 5,
      output_rows: 3,
      status: 'failed',
    });
  });
});

describe('namesFromRows', () => {
  it('splits the rows of visible_names into user names and group names', () => {
    const names = namesFromRows([
      { kind: 'user', id: 'u1', name: 'Ann' },
      { kind: 'group', id: 'g1', name: 'HR' },
      { kind: 'user', id: 'u2', name: 'Bob' },
    ]);
    expect([...names.users]).toEqual([['u1', 'Ann'], ['u2', 'Bob']]);
    expect([...names.groups]).toEqual([['g1', 'HR']]);
  });

  it('is empty for no rows', () => {
    const names = namesFromRows([]);
    expect(names.users.size).toBe(0);
    expect(names.groups.size).toBe(0);
  });
});

describe('appSettingsFromRows', () => {
  it('reads the idle limit', () => {
    expect(appSettingsFromRows([{ key: 'idle_timeout_hours', value: 12 }])).toEqual({ idleTimeoutHours: 12 });
  });
  it('gives the default of 8 hours for a missing row or a value that is not a whole number from 1 to 72', () => {
    expect(appSettingsFromRows([])).toEqual({ idleTimeoutHours: 8 });
    for (const value of [0, 73, 1.5, '8', null, {}]) expect(appSettingsFromRows([{ key: 'idle_timeout_hours', value }])).toEqual({ idleTimeoutHours: 8 });
  });
  it('ignores other keys', () => {
    expect(appSettingsFromRows([{ key: 'other', value: 3 }])).toEqual({ idleTimeoutHours: 8 });
  });
});

describe('usedByFromRows', () => {
  const flows = [{ id: 'f1', name: 'Zeta' }, { id: 'f2', name: 'Alpha' }];
  it('names the flows of each table once, in order, and skips a flow that is not in the list (deleted or not visible)', () => {
    const rows = [
      { flow_id: 'f1', ref_table_name: 'T' },
      { flow_id: 'f1', ref_table_name: 'T' },
      { flow_id: 'f2', ref_table_name: 'T' },
      { flow_id: 'gone', ref_table_name: 'T' },
      { flow_id: 'f2', ref_table_name: 'U' },
    ];
    expect(usedByFromRows(rows, flows)).toEqual(new Map([['T', ['Alpha', 'Zeta']], ['U', ['Alpha']]]));
    expect(usedByFromRows([], flows).size).toBe(0);
  });
});
