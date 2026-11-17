import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const card = (page: Page, text: string) => page.locator('.react-flow__node').filter({ hasText: text });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();

async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Panel test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
}

test('without a selected step the panel says to select one; it is 380 px wide', async ({ page }) => {
  await newFlow(page);
  await expect(panel(page)).toContainText('Select a step on the canvas');
  expect(Math.round((await panel(page).boundingBox())!.width)).toBe(380);
});

test('a selected step shows its number, name and description, and the tabs Setup, Configure and Test', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Filter');
  await expect(panel(page).getByRole('heading', { name: '1. Filter' })).toBeVisible();
  await expect(panel(page)).toContainText('Keeps the rows that match a condition.');
  const tabs = panel(page).getByRole('tab');
  await expect(tabs).toHaveText(['Setup', 'Configure', 'Test']);
  await expect(panel(page).getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(panel(page).getByRole('tabpanel')).toContainText('settings form');
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await expect(panel(page).getByText('No preview yet')).toBeVisible();
});

test('renaming the step updates the card; an empty name shows an error and keeps the old name', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Filter');
  const name = panel(page).getByRole('textbox', { name: 'Step name' });
  await name.fill('Valid rows only');
  await expect(card(page, 'Valid rows only')).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: '1. Valid rows only' })).toBeVisible();
  await name.fill('   ');
  await expect(panel(page).getByRole('alert')).toContainText('The step has no name.');
  await expect(card(page, 'Valid rows only')).toBeVisible();
});

test('Input from connects steps with the keyboard only, can replace the source, and can clear it', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Input file');
  await addStep(page, 'Filter');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(panel(page).getByRole('heading', { name: '3. Filter' })).toBeVisible();
  const dd = panel(page).getByRole('button', { name: /^Input from: None/ });
  await dd.focus();
  await page.keyboard.press('ArrowDown'); // opens the list on None
  await page.keyboard.press('ArrowDown'); // 1. Input file
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(panel(page).getByRole('button', { name: /^Input from: 1\. Input file$/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('button', { name: /^Input from: 2\. Input file 2$/ })).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('button', { name: /^Input from:/ }).press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('an Input file step has no input to choose; a Lookup has a left and a right input', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await expect(panel(page)).toContainText('This step starts the flow');
  await addStep(page, 'Lookup / Join');
  await expect(panel(page).getByRole('button', { name: /^Input from, left input/ })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: /^Input from, right input/ })).toBeVisible();
});

test('Delete step removes the step and its connections and clears the panel', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Output');
  const dd = panel(page).getByRole('button', { name: /^Input from: None/ });
  await dd.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Delete step' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(panel(page)).toContainText('Select a step on the canvas');
});

test('a published version is read-only in the panel too', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/3');
  await page.locator('.react-flow__node').first().click();
  await expect(panel(page).getByText('This version is published and read-only')).toBeVisible();
  await expect(panel(page).getByRole('textbox', { name: 'Step name' })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Delete step' })).toBeDisabled();
});
