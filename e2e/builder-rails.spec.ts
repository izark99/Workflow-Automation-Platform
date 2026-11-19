import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const settings = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const steps = (page: Page) => page.getByRole('complementary', { name: 'Step types' });
const width = async (loc: ReturnType<Page['locator']>) => Math.round((await loc.boundingBox())!.width);
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();

async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Rail test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
}

/** The position of each step in the flow (the transform React Flow sets), which must not change with a panel. */
const flowPositions = (page: Page) =>
  page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => [e.getAttribute('data-id'), (e as HTMLElement).style.transform]));

test('the step list collapses to 48 px, expands to 184 px, and the toggle keeps the focus', async ({ page }) => {
  await newFlow(page);
  expect(await width(steps(page))).toBe(184);
  const collapse = steps(page).getByRole('button', { name: 'Collapse step list' });
  await collapse.click();
  await expect.poll(() => width(steps(page))).toBe(48);
  const expand = steps(page).getByRole('button', { name: 'Expand step list' });
  await expect(expand).toBeFocused();
  await expect(steps(page).getByRole('button', { name: 'Add step Filter' })).toHaveCount(0);
  await expand.click();
  await expect.poll(() => width(steps(page))).toBe(184);
  await addStep(page, 'Filter');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
});

test('the settings panel collapses to 48 px; the rail shows the step name, and a click on a step card opens it', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Filter');
  await expect(settings(page).getByRole('heading', { name: '1. Filter' })).toBeVisible();
  await settings(page).getByRole('button', { name: 'Collapse settings panel' }).click();
  await expect.poll(() => width(settings(page))).toBe(48);
  await expect(settings(page).locator('span[title="1. Filter"]')).toBeVisible();
  await expect(settings(page).getByRole('tab')).toBeHidden();
  await page.locator('.react-flow__node').first().click();
  await expect.poll(() => width(settings(page))).toBe(380);
  await expect(settings(page).getByRole('tab', { name: 'Setup' })).toBeVisible();
});

test('with no step selected the settings rail shows only the toggle, in both states', async ({ page }) => {
  await newFlow(page);
  await expect(settings(page).getByRole('button', { name: 'Add parameter' })).toBeVisible();
  await settings(page).getByRole('button', { name: 'Collapse settings panel' }).click();
  await expect.poll(() => width(settings(page))).toBe(48);
  await expect(settings(page).getByRole('button', { name: 'Add parameter' })).toBeHidden();
  await expect(settings(page).getByRole('button')).toHaveCount(1);
  await settings(page).getByRole('button', { name: 'Expand settings panel' }).click();
  await expect(settings(page).getByRole('button', { name: 'Add parameter' })).toBeVisible();
});

test('steps keep their positions when a panel changes width, and Fit to screen uses the new size', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Input file');
  await addStep(page, 'Filter');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  const before = await flowPositions(page);
  await steps(page).getByRole('button', { name: 'Collapse step list' }).click();
  await settings(page).getByRole('button', { name: 'Collapse settings panel' }).click();
  await expect.poll(() => width(settings(page))).toBe(48);
  expect(await flowPositions(page)).toEqual(before);
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await page.waitForTimeout(400);
  const canvas = (await page.locator('.react-flow').first().boundingBox())!;
  expect(canvas.width).toBeGreaterThan(1440 - 48 - 48 - 2);
  for (const n of await page.locator('.react-flow__node').all()) {
    const b = (await n.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(canvas.x);
    expect(b.x + b.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  }
});

test('a published version is read-only in both panel states', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/1');
  await expect(page.getByRole('status').filter({ hasText: /published/i }).first()).toBeVisible();
  await page.locator('.react-flow__node').first().click();
  await expect(settings(page).getByText(/read-only|published/i).first()).toBeVisible();
  await settings(page).getByRole('button', { name: 'Collapse settings panel' }).click();
  await steps(page).getByRole('button', { name: 'Collapse step list' }).click();
  await expect.poll(() => width(settings(page))).toBe(48);
  await expect(steps(page).getByRole('button', { name: /^Add step/ })).toHaveCount(0);
  await steps(page).getByRole('button', { name: 'Expand step list' }).click();
  await expect(steps(page).getByRole('button', { name: 'Add step Filter' })).toBeDisabled();
});
