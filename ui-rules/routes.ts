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
];
