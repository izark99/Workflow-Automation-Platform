import type { DatasetConfig } from './helpers';

/**
 * The two datasets of testcase/TEST_RULES.md. The same flow file must give the expected workbook for both.
 * Which file belongs to which Input step is configured here, never in the flow.
 */
export const DATASETS: DatasetConfig[] = [
  {
    name: 'September 2026',
    dir: 'testcase',
    effectiveDate: '2026-09-30',
    inputs: { Timesheet: 'input/timesheet_2026-09.xlsx', Employees: 'input/employees.xlsx' },
    referenceFile: 'reference/reference_tables.xlsx',
    referenceSheets: ['attendance_codes', 'ot_types', 'ot_limits'],
    referenceValidFrom: '2026-01-01',
    expectedFile: 'expected/expected_output_2026-09.xlsx',
  },
  {
    name: 'October 2026',
    dir: 'testcase/variant_2026-10',
    effectiveDate: '2026-10-31',
    inputs: { Timesheet: 'input/timesheet_2026-10.xlsx', Employees: 'input/employees.xlsx' },
    referenceFile: 'reference/reference_tables.xlsx',
    referenceSheets: ['attendance_codes', 'ot_types', 'ot_limits'],
    referenceValidFrom: '2026-01-01',
    expectedFile: 'expected/expected_output_2026-10.xlsx',
  },
];

export const COMPARED_SHEETS = ['Summary', 'Exceptions', 'OT_breaches'];
export const TIMESHEET_FLOW = 'flows/monthly-timesheet.flow.json';
