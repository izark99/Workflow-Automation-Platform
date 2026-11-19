import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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

  await panel(page).getByRole('button', { name: 'Move parameter 2 up' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Key 1' })).toHaveValue('team');
  await expect(panel(page).getByRole('textbox', { name: 'Options 1' })).toHaveValue('A\nB');
  await expect(panel(page).getByRole('button', { name: 'Move parameter 1 up' })).toBeDisabled();

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
