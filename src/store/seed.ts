import type { Snapshot } from './local-store';
import type { FlowRecord, FlowVersionRecord } from './types';

// Seed data for the local store. It shows what the design screens show (flows, versions, groups, the three reference
// tables of screen 5). The values are the sample content of the screens, not read from `testcase/`, and the engine
// never sees them unless a flow reads them. The acceptance and e2e runs bring the real flow and tables themselves.

const definition = (name: string, steps: number): unknown => ({
  schemaVersion: 1,
  name,
  nodes: [
    { id: 'input', type: 'input_file', label: 'Input file', position: { x: 0, y: 0 }, settings: {} },
    ...Array.from({ length: Math.max(0, steps - 2) }, (_, i) => ({ id: `step-${i + 1}`, type: 'column_mapping', label: `Column mapping ${i + 1}`, position: { x: 0, y: 96 * (i + 1) }, settings: {} })),
    { id: 'output', type: 'output', label: 'Output', position: { x: 0, y: 96 * Math.max(1, steps - 1) }, settings: { file: 'Result', sheet: 'Sheet1' } },
  ],
  edges: [],
});

const published = (versionNo: number, validFrom: string, validTo: string | null, changeNote: string, name: string, steps: number): FlowVersionRecord => ({
  versionNo,
  validFrom,
  validTo,
  status: 'published',
  changeNote,
  definition: definition(name, steps),
});

const flow = (id: string, name: string, ownerId: string, scope: FlowRecord['scope'], groupIds: string[], versions: FlowVersionRecord[], deletedAt: string | null = null): FlowRecord => ({
  id,
  name,
  ownerId,
  scope,
  deletedAt,
  groupIds,
  versions,
});

export function seedSnapshot(): Snapshot {
  const timesheet = 'Monthly timesheet summary';
  return {
    currentUserId: 'user-harold',
    seq: 100,
    users: [
      { id: 'user-harold', name: 'Harold', email: 'harold@example.com', role: 'admin', groupIds: ['group-payroll', 'group-analytics'] },
      { id: 'user-lan', name: 'Lan', email: 'lan@example.com', role: 'user', groupIds: ['group-payroll'] },
      { id: 'user-minh', name: 'Minh', email: 'minh@example.com', role: 'user', groupIds: ['group-analytics'] },
      { id: 'user-thu', name: 'Thu', email: 'thu@example.com', role: 'user', groupIds: ['group-payroll', 'group-analytics'] },
    ],
    groups: [
      { id: 'group-payroll', name: 'HR Payroll' },
      { id: 'group-analytics', name: 'HR Analytics' },
    ],
    flows: [
      flow('flow-timesheet', timesheet, 'user-harold', 'shared', ['group-payroll', 'group-analytics'], [
        published(1, '2026-01-01', '2026-03-31', 'First version', timesheet, 6),
        published(2, '2026-04-01', '2026-06-30', 'Added the OT limit check per week', timesheet, 8),
        published(3, '2026-07-01', null, 'OT type now comes from the attendance code', timesheet, 12),
        { versionNo: 4, validFrom: '2027-01-01', validTo: null, status: 'draft', changeNote: 'New check for rest-day OT', definition: definition(timesheet, 12) },
      ]),
      flow('flow-headcount', 'Headcount report cleanup', 'user-harold', 'shared', ['group-payroll', 'group-analytics'], [published(1, '2026-01-01', null, 'First version', 'Headcount report cleanup', 6)]),
      flow('flow-ot-department', 'OT by department', 'user-harold', 'personal', [], [
        published(1, '2026-01-01', '2026-06-30', 'First version', 'OT by department', 4),
        published(2, '2026-07-01', null, 'Grouped by department', 'OT by department', 5),
      ]),
      flow('flow-insurance', 'Insurance list merge', 'user-minh', 'personal', [], [
        { versionNo: 1, validFrom: '2026-11-01', validTo: null, status: 'draft', changeNote: 'First version', definition: definition('Insurance list merge', 4) },
      ]),
      flow('flow-payroll-check', 'Payroll export check', 'user-lan', 'personal', [], [published(1, '2026-01-01', null, 'First version', 'Payroll export check', 3)], '2026-11-05T09:00:00.000Z'),
      flow('flow-old-headcount', 'Old headcount merge', 'user-harold', 'personal', [], [published(1, '2025-01-01', null, 'First version', 'Old headcount merge', 3)], '2026-10-28T09:00:00.000Z'),
    ],
    refTables: [
      {
        id: 'ref-attendance',
        name: 'Attendance codes',
        description: 'Sample codes for testing.',
        versions: [
          { versionNo: 1, validFrom: '2026-01-01', validTo: '2026-06-30', status: 'published', columns: attendanceColumns, rows: attendanceRows },
          { versionNo: 2, validFrom: '2026-07-01', validTo: null, status: 'published', columns: attendanceColumns, rows: attendanceRows },
        ],
      },
      {
        id: 'ref-ot-types',
        name: 'OT types',
        description: 'Day limit per OT type.',
        versions: [
          {
            versionNo: 1,
            validFrom: '2026-01-01',
            validTo: null,
            status: 'published',
            columns: [
              { name: 'ot_type', type: 'text' },
              { name: 'description', type: 'text' },
              { name: 'day_limit_hours', type: 'number' },
            ],
            rows: [
              ['OT_DAY', 'OT after a day shift', 4],
              ['OT_NIGHT', 'OT after a night shift', 4],
              ['OT_REST', 'OT on a weekly rest day', 8],
              ['OT_HOLIDAY', 'OT on a public holiday', 8],
            ],
          },
        ],
      },
      {
        id: 'ref-ot-limits',
        name: 'OT limits',
        description: 'Sample limits for testing. Replace them with the real limits before go-live.',
        versions: [
          {
            versionNo: 1,
            validFrom: '2026-01-01',
            validTo: null,
            status: 'published',
            columns: [
              { name: 'period', type: 'text' },
              { name: 'limit_hours', type: 'number' },
            ],
            rows: [
              ['WEEK', 16],
              ['MONTH', 40],
            ],
          },
        ],
      },
    ],
    runLog: [],
  };
}

const attendanceColumns = [
  { name: 'code', type: 'text' as const },
  { name: 'description', type: 'text' as const },
  { name: 'work_day_value', type: 'number' as const },
  { name: 'day_category', type: 'text' as const },
  { name: 'ot_type', type: 'text' as const },
];

const attendanceRows = [
  ['X', 'Day shift worked', 1, 'WORK', 'OT_DAY'],
  ['N', 'Night shift worked', 1, 'WORK', 'OT_NIGHT'],
  ['X/2', 'Half day worked', 0.5, 'WORK', 'OT_DAY'],
  ['P', 'Annual leave', 0, 'PAID_LEAVE', 'No OT allowed'],
  ['KL', 'Unpaid leave', 0, 'UNPAID_LEAVE', 'No OT allowed'],
  ['O', 'Sick leave', 0, 'SICK', 'No OT allowed'],
  ['NT', 'Weekly rest day', 0, 'REST', 'OT_REST'],
  ['L', 'Public holiday', 0, 'HOLIDAY', 'OT_HOLIDAY'],
];
