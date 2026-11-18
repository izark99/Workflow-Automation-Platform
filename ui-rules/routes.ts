// Every route that the UI rules run on. A route added to the app is added here in the same task, so it is checked at once.
import type { Page } from '@playwright/test';
import { seedRunnableFlow } from '../e2e/runnable-flow';
import { seedSnapshot } from '../src/store/seed';

/** A draft reference table of 250 rows, so the editable grid and its pager can be checked. */
const seedBigDraft = async (page: Page): Promise<void> => {
  const s = seedSnapshot();
  s.refTables.push({
    id: 'ref-big',
    name: 'Big list',
    description: 'A long table for paging.',
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', columns: [{ name: 'id', type: 'text' }, { name: 'value', type: 'number' }], rows: Array.from({ length: 250 }, (_, i) => [`r${i + 1}`, i + 1]) }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};

export interface RuleRoute {
  path: string;
  /** Names this state of the route when the same path is listed twice. */
  name?: string;
  /** Screens with the page header share the title y and the first block y. */
  sidebar: boolean;
  /** False for a page that has the page header but no sidebar (the components page). */
  nav?: boolean;
  /** The route is expected to show table rows. */
  table?: boolean;
  /** The route loads data from the store, so a delayed load must show the skeleton. */
  skeleton?: boolean;
  /** The route shows a skeleton while it loads, but not in a table (the Run screen): only `aria-busy` and the delay are checked. */
  busy?: boolean;
  /** False when the route's own steps need the English texts, so the pseudo-locale check skips it. */
  pseudo?: boolean;
  /** Runs before the page loads, for example to put data into the store. */
  before?: (page: Page) => Promise<void>;
  /** Puts the page in the state to check after it has loaded, for example by selecting a step. */
  prepare?: (page: Page) => Promise<void>;
}

const USERS_JSON = JSON.stringify([{ email: 'harold@example.com', password: 'correct horse battery' }]);
/** The sign-in screen needs the stand-in sign-in (D67): the key makes the app ask for a sign-in before it shows a route. */
const withSignIn = async (page: Page): Promise<void> => {
  await page.addInitScript((json) => localStorage.setItem('dfw.auth', json), USERS_JSON);
};

export const ROUTES: RuleRoute[] = [
  // The sign-in screen has no sidebar and no page header. It is shown instead of any route when nobody is signed in.
  { path: '/flows', name: 'sign-in screen', sidebar: false, nav: false, before: withSignIn },
  {
    path: '/flows',
    name: 'sign-in screen with an error',
    sidebar: false,
    nav: false,
    before: withSignIn,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('alert').waitFor();
    },
  },
  {
    path: '/flows',
    name: 'sign-in screen after a session ended',
    sidebar: false,
    nav: false,
    before: async (page) => {
      await withSignIn(page);
      await page.addInitScript(() => localStorage.setItem('dfw.authSession', JSON.stringify({ userId: 'memory-harold@example.com', email: 'harold@example.com' })));
    },
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Sign out' }).waitFor();
      await page.evaluate(() => (window as unknown as { dfwAuth: { expire: () => void } }).dfwAuth.expire());
      await page.getByText('Your session ended.').waitFor();
    },
  },
  { path: '/flows', sidebar: true, table: true, skeleton: true },
  { path: '/reference-tables', sidebar: true, table: true, skeleton: true },
  { path: '/admin', sidebar: true, table: true, skeleton: true },
  { path: '/flows/flow-timesheet/run', sidebar: true, busy: true },
  { path: '/flows/flow-timesheet/versions', sidebar: true, table: true, skeleton: true },
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
  { path: '/dev/components', sidebar: true, nav: false },
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
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Unpivot form)',
    sidebar: false,
    // An Unpivot step with a column in each list: chips, text fields, a checkbox.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Unpivot' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      const keep = panel.getByRole('group', { name: 'Columns to keep' });
      await keep.getByRole('textbox', { name: 'Column name' }).fill('id');
      await keep.getByRole('button', { name: 'Add', exact: true }).click();
      await keep.getByRole('button', { name: 'Remove id from Columns to keep' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Pivot form, reference table)',
    sidebar: false,
    // A Pivot step whose new columns come from a reference table: three dropdowns and text fields.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Pivot' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: /^The new columns come from/ }).click();
      await page.getByRole('option', { name: /^A reference table/ }).click();
      await panel.getByRole('button', { name: /^Reference table/ }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Output form)',
    sidebar: false,
    // An Output step with a column sort key and the column list switched on.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Output' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: 'Add sort key' }).click();
      await panel.getByRole('checkbox', { name: 'Write all columns' }).click();
      await panel.getByRole('button', { name: 'Remove sort key 1' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Append form)',
    sidebar: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step Append' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: /^Match columns/ }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (SQL form)',
    sidebar: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Add step SQL' }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('textbox', { name: 'SQL query' }).fill('SELECT * FROM in1');
    },
  },
  {
    path: '/flows/flow-timesheet/versions/3',
    name: '/flows/flow-timesheet/versions/3 (published, read-only notice)',
    sidebar: false,
    // A published version: the version dropdown, the notice with its button, no Save draft or Publish.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'New version from this' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (publish dialog)',
    sidebar: false,
    // The confirm dialog that says which version the publish ends.
    prepare: async (page) => {
      await page.getByRole('banner').getByRole('button', { name: 'Publish' }).click();
      await page.getByRole('dialog', { name: 'Publish v4?' }).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/3',
    name: '/flows/flow-timesheet/versions/3 (new version dialog)',
    sidebar: false,
    // The dialog with the date picker for the start of the new version.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'New version from this' }).click();
      await page.getByRole('dialog', { name: 'New version from v3' }).waitFor();
    },
  },
  {
    path: '/flows/flow-run/run',
    name: '/flows/flow-run/run (a finished run)',
    sidebar: true,
    table: true,
    before: seedRunnableFlow,
    // The three cards with a file chosen, the progress gone, the result tab and its table.
    prepare: async (page) => {
      await page.locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('name,kind\nAnn,WEEK\nBob,MONTH\n') });
      await page.getByRole('button', { name: 'Run flow', exact: true }).click();
      await page.getByRole('heading', { name: 'Result: run finished' }).waitFor({ timeout: 60_000 });
    },
  },
  {
    path: '/flows/flow-timesheet/versions',
    name: '/flows/flow-timesheet/versions (new version dialog with a clash)',
    sidebar: true,
    pseudo: false, // its steps click buttons by their exact English names
    // The dialog with the date picker and the message about a start day inside an existing version.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'New version', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New version from v4' });
      await dialog.getByRole('button', { name: /^Valid from:/ }).click();
      for (let i = 0; i < 6; i++) await page.keyboard.press('PageUp');
      await page.keyboard.press('Enter');
      await dialog.getByRole('alert').waitFor();
    },
  },
  {
    path: '/reference-tables?table=ref-big&v=1',
    name: '/reference-tables (an editable draft with a pager)',
    sidebar: true,
    table: true,
    before: seedBigDraft,
    // Input cells in 57 px rows, the remove buttons, the pager and the toolbar of a draft.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Next rows' }).waitFor();
    },
  },
  {
    path: '/reference-tables?table=ref-big&v=1',
    name: '/reference-tables (paste dialog)',
    sidebar: true,
    before: seedBigDraft,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Paste from Excel' }).click();
      await page.getByRole('dialog', { name: 'Paste from Excel' }).waitFor();
    },
  },
  {
    path: '/reference-tables',
    name: '/reference-tables (new table dialog)',
    sidebar: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'New table' }).first().click();
      await page.getByRole('dialog', { name: 'New reference table' }).waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (edit user dialog)',
    sidebar: true,
    // The dialog with text fields, the role dropdown and one checkbox for each group.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Edit Lan' }).click();
      await page.getByRole('dialog', { name: 'Edit Lan' }).getByRole('checkbox', { name: 'HR Analytics' }).waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (delete group dialog)',
    sidebar: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Delete HR Analytics' }).click();
      await page.getByRole('dialog', { name: 'Delete HR Analytics?' }).waitFor();
    },
  },
];
