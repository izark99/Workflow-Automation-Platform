// Every route that the UI rules run on. A route added to the app is added here in the same task, so it is checked at once.
import type { Page } from '@playwright/test';

export interface RuleRoute {
  path: string;
  /** Names this state of the route when the same path is listed twice. */
  name?: string;
  /** Screens with the page header share the title y and the first block y. */
  sidebar: boolean;
  /** The route is expected to show table rows. */
  table?: boolean;
  /** The route loads data from the store, so a delayed load must show the skeleton. */
  skeleton?: boolean;
  /** Puts the page in the state to check after it has loaded, for example by selecting a step. */
  prepare?: (page: Page) => Promise<void>;
}

export const ROUTES: RuleRoute[] = [
  { path: '/flows', sidebar: true, table: true, skeleton: true },
  { path: '/reference-tables', sidebar: true },
  { path: '/admin', sidebar: true },
  { path: '/flows/flow-timesheet/run', sidebar: true },
  { path: '/flows/flow-timesheet/versions', sidebar: true },
  // The builder has no sidebar and no page header.
  {
    path: '/flows/flow-timesheet/versions/4',
    sidebar: false,
    // With a step selected the settings panel is full (tabs, name field, dropdowns).
    prepare: async (page) => {
      await page.locator('.react-flow__node').first().click();
      await page.getByRole('complementary', { name: 'Step settings' }).getByRole('heading').waitFor();
    },
  },
  { path: '/dev/components', sidebar: true },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Test tab)',
    sidebar: false,
    // The Test tab holds the date picker, the file rows, the output chips and the preview button.
    prepare: async (page) => {
      await page.locator('.react-flow__node').first().click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Test' }).click();
      await panel.getByRole('button', { name: 'Preview first rows' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Configure tab)',
    sidebar: false,
    // The Configure tab of an Input file step: text fields, a checkbox and hints.
    prepare: async (page) => {
      await page.locator('.react-flow__node').first().click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('textbox', { name: 'Header row' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Column mapping grid)',
    sidebar: false,
    // A Column mapping step with one row: checkbox, two text fields, a type dropdown and a remove button.
    prepare: async (page) => {
      await page.locator('.react-flow__node').filter({ hasText: 'Column mapping' }).first().click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: 'Add column' }).click();
      await panel.getByRole('list', { name: 'Column mapping rows' }).getByRole('listitem').waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Formula editor)',
    sidebar: false,
    // A new Formula column step: name field, formula text, message, function buttons, load columns.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Formula column' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('textbox', { name: 'Formula' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (function list open)',
    sidebar: false,
    // The dialog with the searchable list of all functions.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Formula column' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: 'All functions' }).click();
      await page.getByRole('dialog', { name: 'All functions' }).getByRole('button', { name: 'Insert IF', exact: true }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Lookup form)',
    sidebar: false,
    // A Lookup / Join step with a key pair and a brought column: dropdowns, text fields and remove buttons.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Lookup / Join' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: 'Add key pair' }).click();
      await panel.getByRole('button', { name: 'Add column to bring' }).click();
      await panel.getByRole('button', { name: 'Remove brought column 1' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Group by form)',
    sidebar: false,
    // A Group by step with an aggregation row and a group column chip.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Group by' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('textbox', { name: 'Column name' }).fill('dept');
      await panel.getByRole('button', { name: 'Add', exact: true }).click();
      await panel.getByRole('button', { name: 'Add aggregation' }).click();
      await panel.getByRole('button', { name: 'Remove aggregation 1' }).waitFor();
    },
  },
];
