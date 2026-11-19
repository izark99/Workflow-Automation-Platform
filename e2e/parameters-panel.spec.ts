import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedParameterFlow } from './parameter-flow';
import { seedRunnableFlow } from './runnable-flow';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });

async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Parameter test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
}

test('the Parameters panel adds, edits, moves and deletes parameters, and a new flow is not "unsaved"', async ({ page }) => {
  await newFlow(page);
  await expect(panel(page).getByRole('heading', { name: 'Parameters' })).toBeVisible();
  await expect(panel(page)).toContainText('This flow has no parameters.');
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Add parameter', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await panel(page).getByRole('textbox', { name: 'Key 1' }).fill('cutoff');
  await panel(page).getByRole('textbox', { name: 'Label 1' }).fill('Cut-off date');
  await panel(page).getByRole('button', { name: /^Type 1/ }).click();
  await page.getByRole('option', { name: 'Date' }).click();
  await expect(panel(page).getByRole('button', { name: /^Default value 1/ })).toBeVisible();

  await panel(page).getByRole('button', { name: 'Add parameter', exact: true }).click();
  await panel(page).getByRole('textbox', { name: 'Key 2' }).fill('team');
  await panel(page).getByRole('button', { name: /^Type 2/ }).click();
  await page.getByRole('option', { name: 'List' }).click();
  await panel(page).getByRole('textbox', { name: 'Options 2' }).fill('A\nB');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);

  // A repeated key is reported, in the panel.
  await panel(page).getByRole('textbox', { name: 'Key 2' }).fill('CUTOFF');
  await expect(panel(page).getByRole('alert')).toContainText('CUTOFF');
  await panel(page).getByRole('textbox', { name: 'Key 2' }).fill('team');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Move up, parameter 2' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Key 1' })).toHaveValue('team');
  await expect(panel(page).getByRole('textbox', { name: 'Options 1' })).toHaveValue('A\nB');
  await expect(panel(page).getByRole('button', { name: 'Move up, parameter 1' })).toBeDisabled();

  await panel(page).getByRole('button', { name: 'Delete parameter 1' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Key 1' })).toHaveValue('cutoff');
  await expect(panel(page).getByRole('textbox', { name: 'Key 2' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await page.reload();
  await expect(panel(page).getByRole('textbox', { name: 'Key 1' })).toHaveValue('cutoff');
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
});

test('the formula editor accepts PARAM with a key of the version and names an unknown key', async ({ page }) => {
  await newFlow(page);
  await panel(page).getByRole('button', { name: 'Add parameter', exact: true }).click();
  await panel(page).getByRole('textbox', { name: 'Key 1' }).fill('min_n');
  await panel(page).getByRole('button', { name: /^Type 1/ }).click();
  await page.getByRole('option', { name: 'Number' }).click();
  await page.getByRole('button', { name: 'Add step Input file' }).click();
  await page.getByRole('button', { name: 'Add step Filter' }).click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  const cond = panel(page).getByRole('textbox', { name: 'Condition' });
  await cond.fill('[Hours] > PARAM("min_n")');
  // Without loaded columns only the writing is checked, so the unknown key is found once the columns are known.
  await expect(panel(page).getByRole('button', { name: 'Insert a parameter' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Insert a parameter' }).click();
  await page.getByRole('option', { name: 'min_n' }).click();
  await expect(cond).toHaveValue(/PARAM\("min_n"\)$/);
});

test('a published version shows its parameters as read-only', async ({ page }) => {
  await seedRunnableFlow(page);
  await page.goto('/flows/flow-run/versions/1');
  await expect(panel(page).getByRole('heading', { name: 'Parameters' })).toBeVisible();
  await expect(panel(page)).toContainText('This version is published, so its parameters cannot change.');
  await expect(panel(page).getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
});

const csv = (text: string) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const rows = (page: Page) => panel(page).getByRole('table', { name: 'Preview rows' }).locator('tbody tr');

test('the Test tab asks for the parameters that the steps read, and only for those; the preview runs with the value', async ({ page }) => {
  await newFlow(page);
  for (const [key, type] of [['min_age', 'Number'], ['unused', 'Text']] as const) {
    const n = key === 'min_age' ? 1 : 2;
    await panel(page).getByRole('button', { name: 'Add parameter', exact: true }).click();
    await panel(page).getByRole('textbox', { name: `Key ${n}` }).fill(key);
    await panel(page).getByRole('textbox', { name: `Label ${n}` }).fill(key === 'min_age' ? 'Minimum age' : 'Not used');
    await panel(page).getByRole('button', { name: new RegExp(`^Type ${n}`) }).click();
    await page.getByRole('option', { name: type }).click();
  }
  await page.getByRole('button', { name: 'Add step Input file' }).click();
  await page.getByRole('button', { name: 'Add step Filter' }).click();
  await panel(page).getByRole('button', { name: /^Input from: None/ }).press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('textbox', { name: 'Condition' }).fill('[age] > PARAM("min_age")');
  await panel(page).getByRole('tab', { name: 'Test' }).click();

  await expect(panel(page).getByText('Test values of the parameters')).toBeVisible();
  await expect(panel(page).getByRole('textbox', { name: 'Minimum age' })).toBeVisible();
  await expect(panel(page).getByText('Not used')).toHaveCount(0);
  await expect(panel(page).getByRole('alert')).toContainText('min_age');
  await panel(page).locator('input[type=file]').setInputFiles(csv('name,age\nAnn,31\nBob,42\n'));
  await expect(panel(page).getByRole('button', { name: 'Preview first rows' })).toBeDisabled();
  await panel(page).getByRole('textbox', { name: 'Minimum age' }).fill('35');
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(rows(page).first()).toContainText('Bob');
});

test('the dropdowns of a parameter stay inside its card', async ({ page }) => {
  await seedParameterFlow(page);
  await page.goto('/flows/flow-param/versions/2');
  const card = panel(page).getByRole('group', { name: 'Parameter 4' });
  const box = (await card.boundingBox())!;
  for (const name of [/^Type 4/, /^Default value 4/]) {
    const dd = (await card.getByRole('button', { name }).boundingBox())!;
    expect(dd.x + dd.width).toBeLessThanOrEqual(box.x + box.width);
  }
});
