import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// T8.14b: Check (SPEC 15.4 item 6): the rule list, the two outputs with their counts, the quiet warnings of the Test tab and the Run screen.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const csv = (text: string, name = 'data.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');
const group = (page: Page, name: string) => panel(page).getByRole('group', { name });
// Row 4 fails both rules; row 2 fails the hours rule; row 5 fails the department rule.
const DATA = 'id,hours,dept\n1,8,A\n2,30,B\n3,6,C\n4,-2,\n5,12,\n';

async function checkStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Check test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Check');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(DATA));
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
}
const addRule = async (page: Page, n: number, name: string, condition: string, message: string) => {
  await panel(page).getByRole('button', { name: 'Add rule' }).click();
  await panel(page).getByRole('textbox', { name: `Rule name ${n}` }).fill(name);
  await panel(page).getByRole('textbox', { name: `Condition ${n}` }).fill(condition);
  await panel(page).getByRole('textbox', { name: `Message ${n}` }).fill(message);
};

test('the card has the outputs ok and errors, and a new step says what is missing', async ({ page }) => {
  await checkStep(page);
  const card = page.locator('.react-flow__node').filter({ hasText: 'Check' }).last();
  await expect(card.locator('.react-flow__handle.source')).toHaveCount(2);
  await expect(card).toContainText('ok');
  await expect(card).toContainText('errors');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Add at least one rule.' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Add rule' }).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Rule 1 needs a name.' })).toBeVisible();
});

test('two rules and a row that fails both: Passed and Errors with their counts, the row twice, and a warning per rule', async ({ page }) => {
  await checkStep(page);
  await addRule(page, 1, 'Hours range', 'AND([hours] >= 0, [hours] <= 24)', 'Hours must be from 0 to 24.');
  await addRule(page, 2, 'Department', 'NOT(ISBLANK([dept]))', 'A department is required.');
  await expect(panel(page).getByRole('status').filter({ hasText: 'written correctly' }).first()).toBeVisible();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(2, { timeout: 30_000 });
  const chips = group(page, 'Output of the step');
  await expect(chips.getByRole('button', { name: 'Passed (2)' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Errors (4)' })).toBeVisible();
  // The quiet warning says how many rows failed each rule.
  await expect(panel(page)).toContainText('rule "Hours range": rows that failed: 2');
  await expect(panel(page)).toContainText('rule "Department": rows that failed: 2');
  await chips.getByRole('button', { name: /^Errors/ }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(previewRows(page)).toHaveCount(4, { timeout: 30_000 });
  await expect(panel(page).getByRole('columnheader')).toHaveText(['id', 'hours', 'dept', 'Rule', 'Message']);
  const ids = await Promise.all([0, 1, 2, 3].map((i) => previewRows(page).nth(i).locator('td').first().textContent()));
  expect(ids).toEqual(['2', '4', '4', '5']);
  await expect(previewRows(page).nth(1).locator('td').nth(3)).toHaveText('Hours range');
  await expect(previewRows(page).nth(2).locator('td').nth(3)).toHaveText('Department');
});

test('an invalid condition shows the formula message in the rule, and the preview names the rule', async ({ page }) => {
  await checkStep(page);
  await addRule(page, 1, 'Broken', '[hours] >', 'm');
  await expect(panel(page).getByRole('alert').first()).toContainText(/Character \d+:/);
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('rule "Broken"', { timeout: 30_000 });
});

test('a rule can be removed, and the others keep their numbers', async ({ page }) => {
  await checkStep(page);
  await addRule(page, 1, 'One', 'TRUE', 'm1');
  await addRule(page, 2, 'Two', 'TRUE', 'm2');
  await panel(page).getByRole('button', { name: 'Remove rule 1' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Rule name 1' })).toHaveValue('Two');
  await expect(panel(page).getByRole('textbox', { name: 'Rule name 2' })).toHaveCount(0);
});

async function seedCheckFlow(page: Page, stop: boolean) {
  const s = seedSnapshot();
  const rules = [
    { name: 'Hours range', condition: 'AND([hours] >= 0, [hours] <= 24)', message: 'Hours must be from 0 to 24.' },
    { name: 'Department', condition: 'NOT(ISBLANK([dept]))', message: 'A department is required.' },
  ];
  s.flows.push({
    id: 'flow-check', name: 'Check run flow', ownerId: 'user-harold', scope: 'personal', deletedAt: null, groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'published', changeNote: '', definition: {
      schemaVersion: 4,
      nodes: [
        { id: 'People', type: 'input_file', label: 'People', position: { x: 0, y: 0 }, settings: { key: 'people', headerRow: 1 } },
        { id: 'Chk', type: 'check', label: 'Timesheet check', position: { x: 0, y: 96 }, settings: { rules, stop } },
        { id: 'Out', type: 'output', label: 'Out', position: { x: 0, y: 192 }, settings: { file: 'Result', format: 'xlsx', sheet: 'Passed' } },
      ],
      edges: [{ source: 'People', target: 'Chk' }, { source: 'Chk', sourceHandle: 'ok', target: 'Out' }],
    } }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}
const runButton = (page: Page) => page.getByRole('button', { name: /^Run flow$|^Run again$/ });

test('the Run screen shows the failed rules as quiet warnings and the run goes on', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
  await seedCheckFlow(page, false);
  await page.goto('/flows/flow-check/run');
  await expect(page.getByRole('heading', { name: 'Run flow', level: 1 })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(csv(DATA, 'people.csv'));
  await runButton(page).click();
  await expect(page.getByText('rule "Hours range": rows that failed: 2')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('rule "Department": rows that failed: 2')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('with "stop the run" on, the Run screen stops and says how many rows failed each rule', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T09:00:00+07:00'));
  await seedCheckFlow(page, true);
  await page.goto('/flows/flow-check/run');
  await page.locator('input[type=file]').setInputFiles(csv(DATA, 'people.csv'));
  await runButton(page).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The run could not finish.', { timeout: 60_000 });
  await expect(alert).toContainText('"Hours range" (2), "Department" (2)');
  await expect(alert).toContainText('turn off "Stop the run when a rule fails"');
});
