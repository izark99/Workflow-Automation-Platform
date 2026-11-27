// Every route that the UI rules run on. A route added to the app is added here in the same task, so it is checked at once.
import type { Page } from '@playwright/test';
import { seedParameterFlow } from '../e2e/parameter-flow';
import { REF_FLOW, seedReferenceStep } from '../e2e/reference-step-flow';
import { ambiguousLayouts, clearLayouts } from '../scripts/lib/layout-fixtures';
import { seedAllSteps } from '../e2e/all-steps-flow';
import { seedRunnableFlow } from '../e2e/runnable-flow';
import { seedSnapshot } from '../src/store/seed';

/**
 * A route with a flow of an Input file step and one new step that reads it, the new step selected, on its Configure or Test tab.
 * Selectors are structural: the pseudo-locale check changes every name.
 */
function stepRoute(name: string, type: string, settings: Record<string, unknown>, tab: 'configure' | 'test', parameters?: unknown[]): RuleRoute {
  const id = `flow-step-${type}`;
  return {
    path: `/flows/${id}/versions/1`,
    name: `/flows/${id}/versions/1 (${name})`,
    sidebar: false,
    before: async (page) => {
      const s = seedSnapshot();
      s.flows.push({
        id, name: `Step ${type}`, ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
        versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: {
          schemaVersion: 4,
          ...(parameters ? { parameters } : {}),
          nodes: [
            { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 100 }, settings: { key: 'a', headerRow: 1 } },
            ...(type === 'compare' ? [{ id: 'b', type: 'input_file', label: 'Bravo', position: { x: 0, y: 300 }, settings: { key: 'b', headerRow: 1 } }] : []),
            { id: 's', type, label: 'Beta', position: { x: 400, y: 100 }, settings: JSON.parse(JSON.stringify(settings)) },
          ],
          // Compare reads two tables: the new one from the first Input file and the old one from the second.
          edges: type === 'compare' ? [{ source: 'a', target: 's', targetHandle: 'new' }, { source: 'b', target: 's', targetHandle: 'old' }] : [{ source: 'a', target: 's' }],
        } }],
      });
      await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
    },
    prepare: async (page) => {
      await page.locator('.react-flow__node').last().click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab').nth(tab === 'configure' ? 1 : 2).click();
      await panel.getByRole('tabpanel').waitFor();
    },
  };
}

/** A csv of n rows for the preview popup routes. */
function bigCsv(n: number): string {
  return `k,v\n${Array.from({ length: n }, (_, i) => `row${i + 1},${i + 1}`).join('\n')}\n`;
}

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
  /** The sidebar is collapsed to its 64 px rail in this state of the route. */
  railSidebar?: boolean;
  /** Runs before the page loads, for example to put data into the store. */
  before?: (page: Page) => Promise<void>;
  /** Puts the page in the state to check after it has loaded, for example by selecting a step. */
  prepare?: (page: Page) => Promise<void>;
}

/** Puts the named panels in the collapsed state before the page loads (the key of src/ui/panels/panel-state.ts). */
export const collapsePanels = (...ids: string[]) => async (page: Page): Promise<void> => {
  const state = Object.fromEntries(ids.map((id) => [id, true]));
  await page.addInitScript((json) => localStorage.setItem('dfw.panels', json), JSON.stringify(state));
};

const USERS_JSON = JSON.stringify([{ email: 'harold@example.com', password: 'correct horse battery' }]);
/** The sign-in screen needs the stand-in sign-in (D67): the key makes the app ask for a sign-in before it shows a route. */
const withSignIn = async (page: Page): Promise<void> => {
  await page.addInitScript((json) => localStorage.setItem('dfw.auth', json), USERS_JSON);
};

/** A signed-in person whose account has a flag (the change-password screen, the locked screen). */
const withAccountFlag = (flag: 'mustChangePassword' | 'locked') => async (page: Page): Promise<void> => {
  const snapshot = seedSnapshot();
  snapshot.users.find((u) => u.id === 'user-harold')![flag] = true;
  await page.addInitScript(([auth, seed]) => {
    localStorage.setItem('dfw.auth', auth!);
    localStorage.setItem('dfw.seed', seed!);
  }, [USERS_JSON, JSON.stringify(snapshot)] as const);
};
const signInAs = async (page: Page): Promise<void> => {
  await page.getByLabel(/Email/).fill('harold@example.com');
  await page.getByLabel(/^\W*Password\W*$/).fill('correct horse battery');
  await page.getByRole('button', { name: /^\W*Sign in\W*$/ }).click();
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
      await page.getByRole('button', { name: /^\W*Sign in\W*$/ }).click();
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    path: '/flows',
    name: 'change-password screen',
    sidebar: false,
    nav: false,
    before: withAccountFlag('mustChangePassword'),
    prepare: async (page) => {
      await signInAs(page);
      await page.getByRole('button', { name: /Save password/ }).waitFor();
      await page.getByRole('button', { name: /Save password/ }).click(); // the empty form shows its error
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    path: '/flows',
    name: 'locked-account screen',
    sidebar: false,
    nav: false,
    before: withAccountFlag('locked'),
    prepare: async (page) => {
      await signInAs(page);
      await page.getByRole('alert').first().waitFor();
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
  {
    path: '/flows',
    name: 'sign-in screen after the inactivity limit',
    sidebar: false,
    nav: false,
    before: async (page) => {
      await withSignIn(page);
      await page.addInitScript(() => {
        localStorage.setItem('dfw.authSession', JSON.stringify({ userId: 'memory-harold@example.com', email: 'harold@example.com' }));
        localStorage.setItem('dfw.idleMs', '60000');
        localStorage.setItem('dfw.lastActivity', String(Date.now() - 3 * 3_600_000));
      });
    },
    // The quiet note (muted text with an info icon) above the form.
    prepare: async (page) => {
      await page.locator('p[role="status"][class*="quiet"]').waitFor();
    },
  },
  {
    path: '/flows',
    name: '/flows (inactivity dialog)',
    sidebar: true,
    table: true,
    before: async (page) => {
      await withSignIn(page);
      await page.addInitScript(() => {
        localStorage.setItem('dfw.authSession', JSON.stringify({ userId: 'memory-harold@example.com', email: 'harold@example.com' }));
        localStorage.setItem('dfw.idleMs', '60000');
      });
      await page.clock.install();
    },
    // 40 s without activity of a 60 s limit: the dialog with the countdown shows (the last 30 s).
    prepare: async (page) => {
      await page.locator('tbody tr').first().waitFor();
      await page.clock.fastForward(40_000);
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (Texts tab)',
    sidebar: true,
    table: true,
    // The tab with the search field, two dropdowns, a table of 40 texts and the pager.
    prepare: async (page) => {
      await page.getByRole('tab', { name: /Texts/ }).click();
      await page.getByRole('button', { name: /Edit nav\.flows/ }).waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (Settings tab)',
    sidebar: true,
    // The card with the number field, the info button and Save.
    prepare: async (page) => {
      await page.getByRole('tab', { name: /Settings/ }).click();
      await page.locator('input[inputmode="numeric"]').waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (Settings tab, invalid value)',
    sidebar: true,
    // An error under the field, and Save off.
    prepare: async (page) => {
      await page.getByRole('tab', { name: /Settings/ }).click();
      const field = page.locator('input[inputmode="numeric"]');
      await field.fill('73');
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (edit text dialog)',
    sidebar: true,
    prepare: async (page) => {
      await page.getByRole('tab', { name: /Texts/ }).click();
      await page.getByRole('button', { name: /Edit nav\.flows/ }).click();
      await page.getByRole('dialog').waitFor();
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
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (Auto arrange: toast with Undo)',
    sidebar: false,
    // The canvas controls with the Auto arrange button, and the toast with its compact Undo button.
    prepare: async (page) => {
      // By position, not by name: the pseudo-locale check runs this route with every text changed. The buttons are zoom out, zoom in, Auto arrange, fit.
      await page.getByRole('toolbar').getByRole('button').nth(2).click();
      await page.locator('[role=status] button').nth(1).waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (selection toolbar, Snap to grid on)',
    sidebar: false,
    // Three steps selected: the align and distribute toolbar over their box, and the Snap switch pressed.
    prepare: async (page) => {
      const cards = page.locator('.react-flow__node');
      await cards.nth(0).click();
      await cards.nth(1).click({ modifiers: ['Control'] });
      await cards.nth(2).click({ modifiers: ['Control'] });
      await page.locator('.react-flow__node-toolbar [role=toolbar]').waitFor();
      // By position (the pseudo-locale check changes every name): zoom out, zoom in, Auto arrange, Snap, fit.
      await page.locator('.react-flow__panel [role=toolbar]').getByRole('button').nth(3).click();
    },
  },
  {
    path: '/flows/flow-edge-drop/versions/1',
    sidebar: false,
    before: async (page) => {
      const s = seedSnapshot();
      s.flows.push({
        id: 'flow-edge-drop', name: 'Edge drop', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
        versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: {
          schemaVersion: 1,
          nodes: [
            { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 100 }, settings: {} },
            { id: 'b', type: 'output', label: 'Omega', position: { x: 700, y: 100 }, settings: {} },
          ],
          edges: [{ source: 'a', target: 'b' }],
        } }],
      });
      await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
    },
    // The pill "Insert here" and the edge in primary, while the pointer holds a Column mapping step over the first edge.
    prepare: async (page) => {
      await page.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' });
      const mid = await page.locator('.react-flow__edge-path').first().evaluate((p) => {
        const path = p as SVGPathElement;
        const pt = path.getPointAtLength(path.getTotalLength() / 2);
        const m = path.getScreenCTM()!;
        return { x: m.a * pt.x + m.e, y: m.d * pt.y + m.f };
      });
      // A drag over the edge, sent as an event: a real held mouse button would press the step button (scale 0.98) and fail its height.
      await page.evaluate(({ x, y }) => {
        const dt = new DataTransfer();
        dt.setData('application/x-dfw-step', 'column_mapping');
        dt.setData('application/x-dfw-step.column_mapping', '1');
        const target = document.elementFromPoint(x, y) ?? document.body;
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      }, mid);
      await page.locator('[class*=insertPill]').waitFor();
    },
  },
  {
    path: '/flows/flow-timesheet/versions/4',
    name: '/flows/flow-timesheet/versions/4 (step duplicated: toast and Duplicate button)',
    sidebar: false,
    // A step selected with its Duplicate button in the title row, then Ctrl+D: the copy is selected and the toast says it was pasted.
    prepare: async (page) => {
      await page.locator('.react-flow__node').first().click();
      await page.getByRole('complementary', { name: 'Step settings' }).getByRole('heading').waitFor();
      await page.keyboard.press('Control+KeyD');
      await page.locator('[role=status] button').first().waitFor();
    },
  },
  {
    path: REF_FLOW,
    name: `${REF_FLOW} (Reference table cards)`,
    sidebar: false,
    // A card with a table and a card that says to choose one.
    before: (page) =>
      seedReferenceStep(page, {
        nodes: [
          { id: 'limits', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'OT types' } },
          { id: 'empty', type: 'reference_table', label: 'Reference table 2', position: { x: 280, y: 0 }, settings: {} },
        ],
      }),
    prepare: async (page) => {
      await page.locator('.react-flow__node').nth(1).waitFor();
    },
  },
  ...(
    [
      ['no table chosen', {}, undefined],
      ['table chosen: version and columns', {}, 'Closed range'],
      ['no version for the test date', {}, 'Old limits'],
      ['table not in the list', { settings: { table: 'Gone' } }, undefined],
      ['table not readable yet', { user: 'user-lan' as const, nodes: [] }, 'Closed range'],
    ] as const
  ).map(
    ([state, opts, table]): RuleRoute => ({
      path: REF_FLOW,
      name: `${REF_FLOW} (Reference table, Configure: ${state})`,
      sidebar: false,
      before: (page) =>
        seedReferenceStep(page, 'settings' in opts ? { nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: opts.settings }] } : opts),
      // Without names that depend on the language, so the pseudo-locale check can run these states too.
      prepare: async (page) => {
        const settings = page.locator('#builder-settings');
        if ('nodes' in opts) await page.locator('#builder-steps [role=group]').first().getByRole('button').nth(1).click();
        else await page.locator('.react-flow__node').first().click();
        await settings.getByRole('tab').nth(1).click();
        const dropdown = settings.getByRole('tabpanel').getByRole('button').first();
        if (table) {
          await dropdown.click();
          await page.getByRole('option', { name: table, exact: true }).click();
        }
        await dropdown.waitFor();
      },
    }),
  ),
  {
    path: REF_FLOW,
    name: `${REF_FLOW} (Reference table, Test tab with rows)`,
    sidebar: false,
    before: (page) => seedReferenceStep(page, { nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'OT limits' } }] }),
    // The preview of the table: no file is needed, so the rows appear. No language-dependent names.
    prepare: async (page) => {
      const settings = page.locator('#builder-settings');
      await page.locator('.react-flow__node').first().click();
      await settings.getByRole('tab').nth(2).click();
      await settings.getByRole('tabpanel').getByRole('button').filter({ hasNotText: /\d{4}/ }).first().click();
      await settings.getByRole('table').locator('tbody tr').first().waitFor({ timeout: 30_000 });
    },
  },
  {
    path: REF_FLOW,
    name: `${REF_FLOW} (date check, Configure tab)`,
    sidebar: false,
    // A flow version of 2027 and a table whose last version ends in 2026: the warning under the dropdown.
    before: (page) => seedReferenceStep(page, { nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'Ends 2026' } }], validFrom: '2027-01-01', validTo: '2027-12-31' }),
    prepare: async (page) => {
      const settings = page.locator('#builder-settings');
      await page.locator('.react-flow__node').first().click();
      await settings.getByRole('tab').nth(1).click();
      await settings.getByRole('tabpanel').getByRole('status').first().waitFor();
    },
  },
  {
    path: REF_FLOW,
    name: `${REF_FLOW} (date check, publish dialog)`,
    sidebar: false,
    pseudo: false, // the Publish button is found by its English name
    before: (page) => seedReferenceStep(page, { nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'Ends 2026' } }], validFrom: '2027-01-01', validTo: '2027-12-31' }),
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await page.getByRole('dialog').getByRole('status').waitFor();
    },
  },
  {
    path: '/flows/flow-refstep/run',
    name: '/flows/flow-refstep/run (date check warning)',
    sidebar: true,
    busy: true,
    // A published flow that reads a table which ends in 2026: the warning above the list of versions.
    before: (page) => seedReferenceStep(page, { status: 'published', nodes: [{ id: 'ref', type: 'reference_table', label: 'Reference table', position: { x: 0, y: 0 }, settings: { table: 'Ends 2026' } }] }),
    prepare: async (page) => {
      await page.getByRole('status').first().waitFor();
    },
  },
  ...(
    [
      ['Configure: a bound field', 1, [{ key: 'sheet', label: 'Sheet to read', type: 'text', required: true, default: 'July' }], { key: 'people', sheet: { $param: 'sheet' }, headerRow: 1 }],
      ['Configure: a deleted parameter', 1, [{ key: 'other', label: 'Other', type: 'text', required: false }], { key: 'people', sheet: { $param: 'gone' }, headerRow: 1 }],
      ['Test: the value now', 2, [{ key: 'sheet', label: 'Sheet to read', type: 'text', required: true, default: 'July' }], { key: 'people', sheet: { $param: 'sheet' }, headerRow: 1 }],
      ['Test: a value that cannot be used', 2, [{ key: 'row', label: 'Header row number', type: 'number', required: true, default: 0 }], { key: 'people', headerRow: { $param: 'row' } }],
    ] as const
  ).map(
    ([state, tab, parameters, inputSettings]): RuleRoute => ({
      path: REF_FLOW,
      name: `${REF_FLOW} (parameter control, ${state})`,
      sidebar: false,
      before: (page) => seedReferenceStep(page, { parameters: [...parameters], nodes: [{ id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { ...inputSettings } }] }),
      // Without names that depend on the language, so the pseudo-locale check runs on these states too.
      prepare: async (page) => {
        await page.locator('.react-flow__node').first().click();
        const settings = page.locator('#builder-settings');
        await settings.getByRole('tab').nth(tab).click();
        await settings.getByRole('tabpanel').getByText(/\S/).first().waitFor();
      },
    }),
  ),
  ...(
    [
      ['with the group and a value', { key: 'sheet', label: 'Sheet to read', type: 'text', required: true, default: 'July' }],
      ['with the group and an error', { key: 'sheet', label: 'Sheet to read', type: 'text', required: true }],
    ] as const
  ).map(
    ([state, parameter]): RuleRoute => ({
      path: '/flows/flow-refstep/run',
      name: `/flows/flow-refstep/run (settings that use a parameter, ${state})`,
      sidebar: true,
      busy: true,
      before: (page) =>
        seedReferenceStep(page, {
          status: 'published',
          parameters: [{ ...parameter }],
          nodes: [
            { id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { key: 'people', sheet: { $param: 'sheet' }, headerRow: 1 } },
            { id: 'ref', type: 'reference_table', label: 'Limits table', position: { x: 0, y: 120 }, settings: { table: 'Closed range' } },
          ],
        }),
      // Three groups: the versions, the settings that use a parameter, and the files. No language-dependent names.
      prepare: async (page) => {
        await page.locator('[role=group]').nth(2).waitFor();
      },
    }),
  ),
  ...(
    [
      ['defaults', { key: 'people', headerRow: 1 }, 'draft', undefined],
      ['a marker row, a row to ignore, required columns', { key: 'people', headerRow: 2, firstColumn: 'C', lastColumn: 'H', stopAt: { kind: 'marker', text: 'Prepared by', match: 'starts_with', column: 'Label' }, ignoreRows: [{ column: 'Label', text: 'Subtotal' }], expect: ['Code', 'Amount'] }, 'draft', undefined],
      ['an empty-rows stop and a fixed row', { key: 'people', headerRow: 1, stopAt: { kind: 'blank_rows', count: 2 } }, 'draft', undefined],
      ['errors', { key: 'people', headerRow: 1 }, 'draft', 'A1'],
      ['read-only', { key: 'people', headerRow: 1, firstColumn: 'B', stopAt: { kind: 'row', row: 9 } }, 'published', undefined],
    ] as const
  ).map(
    ([state, inputSettings, status, typed]): RuleRoute => ({
      path: REF_FLOW,
      name: `${REF_FLOW} (region settings, ${state})`,
      sidebar: false,
      before: (page) => seedReferenceStep(page, { status, nodes: [{ id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { ...inputSettings } }] }),
      // Without names that depend on the language, so the pseudo-locale check runs on these states too.
      prepare: async (page) => {
        await page.locator('.react-flow__node').first().click();
        const settings = page.locator('#builder-settings');
        await settings.getByRole('tab').nth(1).click();
        const boxes = settings.getByRole('tabpanel').getByRole('textbox');
        // The boxes in order: name, sheet, header row, rows to skip, first column, last column.
        if (typed) await boxes.nth(4).fill(typed);
        await boxes.nth(4).waitFor();
      },
    }),
  ),
  ...(
    [
      ['no file', undefined, false],
      ['reading', 'title-and-footer (xlsx)', true],
      ['a clear result', 'title-and-footer (xlsx)', false],
      ['an ambiguous result', 'two-tables (xlsx)', false],
      ['no table found', 'text-only (csv)', false],
      ['an error', 'broken', false],
    ] as const
  ).map(
    ([state, layoutName, slow]): RuleRoute => ({
      path: REF_FLOW,
      name: `${REF_FLOW} (analyze file, ${state})`,
      sidebar: false,
      before: async (page) => {
        await seedReferenceStep(page, { nodes: [{ id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { key: 'people', headerRow: 1 } }] });
        if (slow) await page.addInitScript(() => localStorage.setItem('dfw.analyzeDelayMs', '600000'));
      },
      // Without names that depend on the language, so the pseudo-locale check runs on these states too.
      prepare: async (page) => {
        await page.locator('.react-flow__node').first().click();
        const settings = page.locator('#builder-settings');
        await settings.getByRole('tab').nth(2).click();
        if (layoutName === undefined) {
          await page.locator('[data-analyze=run]').waitFor();
          return;
        }
        const layout = [...clearLayouts(), ...ambiguousLayouts()].find((l) => l.name === layoutName);
        const file = layout
          ? { name: layout.file.name, mimeType: layout.format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(layout.file.bytes) }
          : { name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a table') };
        await settings.locator('input[type=file]').setInputFiles(file);
        await page.locator('[data-analyze=run]').click();
        if (slow) await settings.getByRole('progressbar').waitFor();
        else await settings.locator('[role=group] , [role=alert], [role=status]').first().waitFor();
        await page.waitForTimeout(300);
      },
    }),
  ),
  ...(
    [
      ['Test tab, a stop text that was not found', 'test'],
      ['Run screen, a stop text that was not found', 'run'],
    ] as const
  ).map(
    ([state, where]): RuleRoute => ({
      path: where === 'run' ? '/flows/flow-refstep/run' : REF_FLOW,
      name: `${where === 'run' ? '/flows/flow-refstep/run' : REF_FLOW} (${state})`,
      sidebar: where === 'run',
      busy: where === 'run' ? true : undefined,
      before: (page) =>
        seedReferenceStep(page, {
          status: where === 'run' ? 'published' : 'draft',
          nodes: [
            { id: 'in', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { key: 'people', headerRow: 1, stopAt: { kind: 'marker', text: 'No such footer', match: 'contains' } } },
            { id: 'out', type: 'output', label: 'Result', position: { x: 0, y: 160 }, settings: { file: 'Result', format: 'xlsx', sheet: 'Rows' } },
          ],
          edges: [{ source: 'in', target: 'out' }],
        }),
      // The file is a small csv; the page waits for the result. No language-dependent names.
      prepare: async (page) => {
        const file = { name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('Code,Amount\nK1,5\nK2,6\nK3,7\n') };
        if (where === 'run') {
          await page.locator('input[type=file]').setInputFiles(file);
          // The Run button is the first button after the group of files.
          await page.locator('[role=group]').last().locator('xpath=following::button[1]').click();
          await page.getByRole('status').filter({ has: page.locator('li') }).first().waitFor({ timeout: 60_000 });
        } else {
          await page.locator('.react-flow__node').first().click();
          const settings = page.locator('#builder-settings');
          await settings.getByRole('tab').nth(2).click();
          await settings.locator('input[type=file]').setInputFiles(file);
          await settings.getByRole('tabpanel').getByRole('button').last().click();
          await settings.getByRole('status').first().waitFor({ timeout: 30_000 });
        }
        await page.waitForTimeout(500);
      },
    }),
  ),
  {
    path: '/reference-tables',
    name: '/reference-tables (import dialog)',
    sidebar: true,
    table: true,
    // The empty dialog: the file button, the target chips, the reason that Import is off.
    prepare: async (page) => {
      await page.getByRole('button', { name: /Import file|^\W*Nhập tệp/ }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    path: '/reference-tables',
    name: '/reference-tables (import dialog with a file)',
    sidebar: true,
    table: true,
    // A file with the preview, the columns with their types, and a new table target.
    prepare: async (page) => {
      await page.getByRole('button', { name: /Import file|^\W*Nhập tệp/ }).click();
      const text = ['Code,Limit,Valid from,Active', ...Array.from({ length: 30 }, (_, i) => `A${i},${i + 0.5},2026-09-30,true`)].join('\n');
      await page.locator('input[type=file]').setInputFiles({ name: 'limits.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
      await page.getByRole('table').last().waitFor();
    },
  },
  {
    path: '/reference-tables',
    name: '/reference-tables (import dialog with problems)',
    sidebar: true,
    table: true,
    // Cell problems under the columns: five of them and "and n more".
    pseudo: false,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Import file' }).click();
      const text = ['n,d', '1,2026-09-30', '2,2026-09-30', '3,2026-09-30', ...Array.from({ length: 9 }, (_, i) => `bad${i},not a date`)].join('\n');
      await page.locator('input[type=file]').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
      await page.getByRole('button', { name: /^Type of column 1/ }).click();
      await page.getByRole('option', { name: 'Number' }).click();
      await page.getByRole('alert').filter({ hasText: 'Row ' }).waitFor();
    },
  },
  { path: '/dev/components', sidebar: true, nav: false },
  {
    path: '/dev/components',
    name: '/dev/components (wide dialog with the preview table)',
    sidebar: true,
    nav: false,
    // The button after the danger button of the Confirm card opens the wide dialog (by position: the pseudo-locale check changes every name).
    prepare: async (page) => {
      await page.locator('main [data-variant=danger]').last().locator('xpath=following-sibling::button').click();
      await page.getByRole('dialog').waitFor();
    },
  },
  { path: '/reference-tables', name: '/reference-tables (list collapsed)', sidebar: true, table: true, before: collapsePanels('refList') },
  // The builder with each panel collapsed (SPEC 12.4, T5.4); T5.6 adds the width rule for them.
  ...([['steps'], ['settings'], ['steps', 'settings']] as const).map(
    (ids): RuleRoute => ({ path: '/flows/flow-timesheet/versions/4', name: `/flows/flow-timesheet/versions/4 (${ids.join(' and ')} collapsed)`, sidebar: false, before: collapsePanels(...ids) }),
  ),
  ...(['/flows', '/admin', '/flows/flow-timesheet/run'] as const).map(
    (path): RuleRoute => ({ path, name: `${path} (sidebar rail)`, sidebar: true, railSidebar: true, before: collapsePanels('sidebar') }),
  ),
  // The card and the Configure form (or the Test tab) of the new steps of Phase 8, each in its states (SPEC 15.4).
  stepRoute('Sort: no key', 'sort', {}, 'configure'),
  stepRoute('Sort: two keys', 'sort', { keys: [{ column: 'hours', direction: 'desc' }, { expression: '[hours] + 1' }] }, 'configure'),
  stepRoute('Remove duplicates: all columns', 'dedupe', {}, 'configure'),
  stepRoute('Remove duplicates: two columns, keep the last', 'dedupe', { columns: ['name', 'hours'], keep: 'last' }, 'configure'),
  stepRoute('Remove duplicates: Test tab with two outputs', 'dedupe', {}, 'test'),
  stepRoute('Split column: new step', 'split_column', { column: '', cut: 'space', names: [], rest: 'last', trim: true, keepOriginal: false }, 'configure'),
  stepRoute('Split column: Vietnamese name at the last space', 'split_column', { column: 'Name', cut: 'last_space', names: ['Family and middle', 'Given'], rest: 'last', trim: true, keepOriginal: false }, 'configure'),
  stepRoute('Split column: given text, rest dropped, original kept', 'split_column', { column: 'Codes', cut: 'text', separator: ' - ', names: ['A', 'B', 'C'], rest: 'drop', trim: false, keepOriginal: true }, 'configure'),
  stepRoute('Clean text: new step', 'clean_text', { columns: [], trim: true, collapse: true, nonPrinting: false, caseMode: 'keep', removeMarks: false, target: 'replace' }, 'configure'),
  stepRoute('Clean text: marks and Proper Case, two columns', 'clean_text', { columns: ['name', 'note'], trim: true, collapse: true, nonPrinting: true, caseMode: 'proper', removeMarks: true, target: 'replace' }, 'configure'),
  stepRoute('Clean text: new columns with a suffix', 'clean_text', { columns: ['name'], trim: true, collapse: false, nonPrinting: false, caseMode: 'upper', removeMarks: false, target: 'suffix', suffix: '_clean' }, 'configure'),
  stepRoute('Check: new step', 'check', { rules: [], stop: false }, 'configure'),
  stepRoute('Check: two rules, stop the run', 'check', { rules: [{ name: 'Hours range', condition: 'AND([hours] >= 0, [hours] <= 24)', message: 'Hours must be from 0 to 24.' }, { name: 'Department', condition: 'NOT(ISBLANK([dept]))', message: 'A department is required.' }], stop: true }, 'configure'),
  stepRoute('Check: an unfinished rule', 'check', { rules: [{ name: '', condition: '[hours] >', message: '' }], stop: false }, 'configure'),
  stepRoute('Check: Test tab with two outputs', 'check', { rules: [{ name: 'Hours range', condition: '[hours] <= 24', message: 'Too many hours.' }], stop: false }, 'test'),
  stepRoute('Compare: new step', 'compare', { keys: [], compare: [] }, 'configure'),
  stepRoute('Compare: two keys, listed columns', 'compare', { keys: [{ new: 'Id', old: 'Code' }, { new: 'Dept', old: 'Dept' }], compare: ['Hours', 'Name'] }, 'configure'),
  stepRoute('Compare: Test tab with three outputs', 'compare', { keys: [{ new: 'Id', old: 'Id' }], compare: [] }, 'test'),
  stepRoute('Top N: defaults', 'top_n', { n: 10, order: 'largest', groupBy: [] }, 'configure'),
  stepRoute('Top N: smallest by a formula, grouped', 'top_n', { n: 3, order: 'smallest', by: { expression: '[hours] * 2' }, groupBy: ['dept'] }, 'configure'),
  stepRoute('Top N: first rows', 'top_n', { n: 5, order: 'first', groupBy: [] }, 'configure'),
  stepRoute('Top N: N from a parameter', 'top_n', { n: { $param: 'n' }, order: 'first', groupBy: [] }, 'configure', [{ key: 'n', label: 'How many', type: 'number', required: true }]),
  // The canvas with the cards of all seven new steps (the icons, the names of the handles), and the step list with its seven groups.
  { path: '/flows/flow-all-steps/versions/1', name: '/flows/flow-all-steps/versions/1 (the cards of the new steps)', sidebar: false, before: seedAllSteps, prepare: async (page) => { await page.locator('.react-flow__node').nth(8).waitFor(); } },
  { path: '/flows/flow-all-steps/run', name: '/flows/flow-all-steps/run (a flow of the new steps)', sidebar: true, busy: true, before: seedAllSteps },
  // The preview popup (SPEC 15.3) in its states. Selectors are structural: the pseudo-locale check changes every name.
  ...(
    [
      ['rows', bigCsv(250), undefined],
      ['Find with matches and their count', bigCsv(250), 'row9'],
      ['Find with no match', bigCsv(250), 'no such text'],
      ['no rows', 'k,v\n', undefined],
    ] as const
  ).map(
    ([state, text, find]): RuleRoute => ({
      path: '/flows/flow-popup/versions/1',
      name: `/flows/flow-popup/versions/1 (preview popup: ${state})`,
      sidebar: false,
      before: async (page) => {
        const s = seedSnapshot();
        s.flows.push({
          id: 'flow-popup', name: 'Popup', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
          versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: {
            schemaVersion: 1,
            nodes: [
              { id: 'a', type: 'input_file', label: 'Alpha', position: { x: 0, y: 100 }, settings: { key: 'a', headerRow: 1 } },
              { id: 'b', type: 'column_mapping', label: 'Beta', position: { x: 400, y: 100 }, settings: { columns: [] } },
            ],
            edges: [{ source: 'a', target: 'b' }],
          } }],
        });
        await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
      },
      prepare: async (page) => {
        await page.locator('.react-flow__node').nth(1).click();
        const panel = page.getByRole('complementary', { name: 'Step settings' });
        await panel.getByRole('tab').nth(2).click();
        await panel.locator('input[type=file]').setInputFiles({ name: 'popup.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
        await panel.locator('div[style*="flex-wrap"] > button').first().click();
        const expand = panel.locator('[class*=countRow] button');
        await expand.waitFor({ timeout: 30_000 });
        await expand.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        if (find) await dialog.locator('input[type=text]').fill(find);
      },
    }),
  ),
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
      await page.getByRole('button', { name: /Add step\W*Formula column/ }).click();
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
      await page.getByRole('button', { name: /Add step\W*Formula column/ }).click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: 'Configure' }).click();
      await panel.getByRole('button', { name: 'All functions' }).click();
      await page.getByRole('dialog', { name: 'All functions' }).getByRole('button', { name: /Insert IF\W*$/ }).waitFor();
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
      await panel.getByRole('button', { name: /^\W*Add\W*$/ }).click();
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
      await keep.getByRole('button', { name: /^\W*Add\W*$/ }).click();
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
      await panel.getByRole('button', { name: /^\W*The new columns come from/ }).click();
      await page.getByRole('option', { name: /^\W*A reference table/ }).click();
      await panel.getByRole('button', { name: /^\W*Reference table/ }).waitFor();
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
      await panel.getByRole('button', { name: /^\W*Match columns/ }).waitFor();
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
      await page.getByRole('button', { name: /^\W*Run flow\W*$/ }).click();
      await page.getByRole('heading', { name: 'Result: run finished' }).waitFor({ timeout: 60_000 });
    },
  },
  {
    path: '/flows/flow-param/run',
    name: '/flows/flow-param/run (Parameters card)',
    sidebar: true,
    before: seedParameterFlow,
    // The Parameters card with one input of each type. The required date is blank: the note says so, and its error shows after the field was touched.
    prepare: async (page) => {
      await page.getByRole('status').filter({ hasText: /Cut-off date/ }).waitFor();
      await page.getByRole('button', { name: /Choose a date/ }).focus();
      await page.getByRole('button', { name: /Choose a date/ }).blur();
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    path: '/flows/flow-param/versions/2',
    name: '/flows/flow-param/versions/2 (Parameters panel)',
    sidebar: false,
    before: seedParameterFlow,
    // A draft with five parameters and no step selected: the Parameters panel with a control for each type of default.
    prepare: async (page) => {
      await page.getByRole('group', { name: /Parameter 5/ }).waitFor();
    },
  },
  {
    path: '/flows/flow-param/versions/2',
    name: '/flows/flow-param/versions/2 (Test values of the parameters)',
    sidebar: false,
    before: seedParameterFlow,
    // The Test tab of the Filter step, which reads the date parameter: its input, the note, and the error after the field was left.
    prepare: async (page) => {
      await page.locator('.react-flow__node').filter({ hasText: 'Keep' }).first().click();
      const panel = page.getByRole('complementary', { name: 'Step settings' });
      await panel.getByRole('tab', { name: /Test/ }).click();
      await panel.getByRole('status').filter({ hasText: /Cut-off date/ }).waitFor();
      await panel.getByRole('button', { name: /Choose a date/ }).focus();
      await panel.getByRole('button', { name: /Choose a date/ }).blur();
      await panel.getByRole('alert').first().waitFor();
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
      await page.getByRole('button', { name: /More actions for this table/ }).click();
      await page.getByRole('option', { name: /Paste from Excel/ }).click();
      await page.getByRole('dialog', { name: 'Paste from Excel' }).waitFor();
    },
  },
  {
    path: '/reference-tables?table=ref-big&v=1',
    name: '/reference-tables (columns dialog with a problem)',
    sidebar: true,
    pseudo: false, // its steps need the English texts
    before: seedBigDraft,
    // One row per column: name, type, remove; Add column; the message that keeps Apply off.
    prepare: async (page) => {
      await page.getByRole('button', { name: /More actions for this table/ }).click();
      await page.getByRole('option', { name: 'Columns', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Columns of the draft' });
      await dialog.getByRole('textbox', { name: 'Name of column 2' }).fill('ID');
      await dialog.getByRole('alert').waitFor();
    },
  },
  {
    path: '/reference-tables?table=ref-big&v=1',
    name: '/reference-tables (description dialog)',
    sidebar: true,
    before: seedBigDraft,
    prepare: async (page) => {
      await page.getByRole('button', { name: /More actions for this table/ }).click();
      await page.getByRole('option', { name: /Edit description/ }).click();
      await page.getByRole('dialog', { name: 'Description of the table' }).waitFor();
    },
  },
  {
    path: '/reference-tables',
    name: '/reference-tables (as a user, tables of own flows)',
    sidebar: true,
    table: true,
    // A user: no admin buttons, the list with a Used by line in each item, and the Used by line above the grid.
    before: async (page) => {
      const s = seedSnapshot();
      s.currentUserId = 'user-lan';
      const node = (id: string, type: string, settings: Record<string, unknown>, y: number) => ({ id, type, label: id, position: { x: 0, y }, settings });
      const def = (table: string) => ({ schemaVersion: 1, nodes: [node('L', 'lookup_join', { source: { kind: 'reference', table }, keys: [], bring: [], onNoMatch: 'blank' }, 0)], edges: [] });
      const version = (definition: unknown) => [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published' as const, changeNote: '', definition }];
      s.flows.push(
        { id: 'f-a', name: 'Flow A', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: version(def('OT limits')) },
        { id: 'f-b', name: 'Flow B', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: version(def('OT limits')) },
        { id: 'f-c', name: 'Flow C', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: version(def('OT limits')) },
        { id: 'f-d', name: 'Flow D', ownerId: 'user-lan', scope: 'personal', deletedAt: null, groupIds: [], versions: version(def('OT limits')) },
      );
      await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
    },
  },
  {
    path: '/reference-tables',
    name: '/reference-tables (as a user, no table is read)',
    sidebar: true,
    // The empty state of a user whose flows read no table.
    before: async (page) => {
      const s = seedSnapshot();
      s.currentUserId = 'user-minh';
      await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
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
    name: '/admin (add user dialog)',
    sidebar: true,
    // The Create account dialog: three fields, the role dropdown, the password row with Generate and Copy, a checkbox.
    prepare: async (page) => {
      await page.getByRole('button', { name: /^\W*Add user\W*$/ }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: /Generate/ }).click();
      await dialog.getByRole('button', { name: /Copy/ }).waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (user menu open)',
    sidebar: true,
    // The "More" menu of a row with its two actions.
    prepare: async (page) => {
      await page.getByRole('button', { name: /More actions for\W*Lan/ }).click();
      await page.getByRole('option').first().waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (lock dialog)',
    sidebar: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /More actions for\W*Lan/ }).click();
      await page.getByRole('option').nth(1).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    path: '/admin',
    name: '/admin (reset password dialog)',
    sidebar: true,
    prepare: async (page) => {
      await page.getByRole('button', { name: /More actions for\W*Lan/ }).click();
      await page.getByRole('option').first().click();
      await page.getByRole('dialog').waitFor();
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
